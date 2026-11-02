#!/usr/bin/env python3
"""Pinned-root filesystem access for the documentation checker.

Requires Python 3. Linux needs openat2 (kernel 5.6+) on x86_64 or aarch64;
macOS needs openat support for O_RESOLVE_BENEATH, O_NOFOLLOW_ANY, O_SEARCH, and
the 64-bit inode fstatat API. Reads open the complete expanded path from the
pinned root FD and use that regular-file descriptor. Metadata checks use a
kernel-beneath operation without requiring file read permission. Startup probes
the required flags and fails closed when the platform does not enforce them.
Containment is guaranteed at open time; an opened file can later be moved.
"""

import ctypes
import errno
import json
import os
import platform
import stat
import sys
import tempfile


class OutsideCheckout(Exception):
    pass


def fail(message):
    raise RuntimeError(message)


class RootedFilesystem:
    def __init__(self, root):
        self.root_path = os.path.realpath(root)
        self._select_open()
        self.root_fd = os.open(
            self.root_path,
            self.directory_flags | os.O_DIRECTORY | getattr(os, "O_CLOEXEC", 0) | os.O_NOFOLLOW,
        )
        self._probe_capabilities()

    def _select_open(self):
        if sys.platform.startswith("linux"):
            machine = platform.machine().lower()
            if machine not in ("x86_64", "amd64", "aarch64", "arm64"):
                fail("Safe documentation file access is unavailable on this Linux architecture")
            self.libc = ctypes.CDLL(None, use_errno=True)
            self.syscall_number = 437
            self.resolve_flags = 0x08 | 0x02 | 0x04  # BENEATH | NO_MAGICLINKS | NO_SYMLINKS
            self.open_flags = os.O_RDONLY | getattr(os, "O_CLOEXEC", 0) | os.O_NONBLOCK
            self.directory_flags = getattr(os, "O_PATH", 0)
            self.stat_flags = getattr(os, "O_PATH", 0) | getattr(os, "O_CLOEXEC", 0)
            if not self.directory_flags or not self.stat_flags:
                fail("Safe metadata access requires O_PATH on Linux")
            self._open_beneath = self._linux_open_beneath
            return
        if sys.platform == "darwin":
            if not hasattr(os, "supports_dir_fd") or os.open not in os.supports_dir_fd:
                fail("Safe documentation file access requires openat support")
            self.resolve_beneath = 0x1000  # Darwin O_RESOLVE_BENEATH
            self.nofollow_any = 0x20000000  # Darwin O_NOFOLLOW_ANY
            self.directory_flags = getattr(os, "O_SEARCH", 0)
            if not self.directory_flags:
                fail("Safe directory traversal requires O_SEARCH on macOS")
            self.open_flags = (
                os.O_RDONLY
                | getattr(os, "O_CLOEXEC", 0)
                | os.O_NONBLOCK
                | self.resolve_beneath
                | self.nofollow_any
            )
            self._open_beneath = self._darwin_open_beneath
            self.libc = ctypes.CDLL(None, use_errno=True)
            machine = platform.machine().lower()
            if machine in ("arm64", "aarch64"):
                self.fstatat = self.libc.fstatat
            elif machine in ("x86_64", "amd64"):
                try:
                    self.fstatat = getattr(self.libc, "fstatat$INODE64")
                except AttributeError:
                    fail("Safe metadata access requires the macOS 64-bit inode fstatat API")
            else:
                fail("Safe metadata access is unavailable on this macOS architecture")
            return
        fail("Safe documentation file access is supported only on macOS and Linux")

    def _linux_open_beneath(self, directory_fd, path, flags=None):
        class OpenHow(ctypes.Structure):
            _fields_ = [
                ("flags", ctypes.c_uint64),
                ("mode", ctypes.c_uint64),
                ("resolve", ctypes.c_uint64),
            ]

        encoded = os.fsencode(path)
        how = OpenHow(
            self.open_flags if flags is None else flags,
            0,
            self.resolve_flags,
        )
        result = self.libc.syscall(
            self.syscall_number,
            ctypes.c_int(directory_fd),
            ctypes.c_char_p(encoded),
            ctypes.byref(how),
            ctypes.c_size_t(ctypes.sizeof(how)),
        )
        if result < 0:
            number = ctypes.get_errno()
            raise OSError(number, os.strerror(number), path)
        return result

    def _darwin_open_beneath(self, directory_fd, path, flags=None):
        requested = self.open_flags if flags is None else flags
        requested |= self.resolve_beneath | self.nofollow_any
        return os.open(path, requested, dir_fd=directory_fd)

    def _probe_capabilities(self):
        directory_flags = self.directory_flags | os.O_DIRECTORY | getattr(os, "O_CLOEXEC", 0)
        with tempfile.TemporaryDirectory(prefix="docs-check-fs-probe-") as directory:
            root_path = os.path.join(directory, "root")
            outside_path = os.path.join(directory, "outside")
            os.mkdir(root_path)
            os.mkdir(outside_path)
            target = os.path.join(root_path, "target")
            no_access = os.path.join(root_path, "no-access")
            searchable = os.path.join(root_path, "searchable")
            link = os.path.join(root_path, "link")
            with open(target, "wb") as stream:
                stream.write(b"probe")
            with open(no_access, "wb"):
                pass
            os.chmod(no_access, 0)
            os.mkdir(searchable)
            os.chmod(searchable, 0o111)
            os.symlink("target", link)
            probe_fd = os.open(root_path, directory_flags)
            try:
                current = self._open_beneath(probe_fd, ".", directory_flags)
                os.close(current)

                # Verify the escape target is readable without the resolver flags.
                unrestricted = os.open("../outside", directory_flags, dir_fd=probe_fd)
                os.close(unrestricted)
                try:
                    escaped = self._open_beneath(probe_fd, "../outside", directory_flags)
                except OSError:
                    pass
                else:
                    os.close(escaped)
                    fail("Safe documentation file access did not prevent a parent-directory escape")

                if sys.platform.startswith("linux"):
                    link_flags = os.O_RDONLY | getattr(os, "O_CLOEXEC", 0)
                else:
                    link_flags = (
                        os.O_RDONLY
                        | getattr(os, "O_CLOEXEC", 0)
                        | self.resolve_beneath
                        | self.nofollow_any
                    )
                target_fd = self._open_beneath(probe_fd, "target", link_flags)
                os.close(target_fd)
                no_access_mode = self._stat_beneath(probe_fd, "no-access")
                searchable_mode = self._stat_beneath(probe_fd, "searchable")
                if (
                    no_access_mode != os.stat(no_access).st_mode
                    or searchable_mode != os.stat(searchable).st_mode
                    or not stat.S_ISREG(no_access_mode)
                    or not stat.S_ISDIR(searchable_mode)
                ):
                    fail("Safe metadata access did not preserve regular file and directory types")
                os.stat("../outside", dir_fd=probe_fd)
                try:
                    self._stat_beneath(probe_fd, "../outside")
                except OSError:
                    pass
                else:
                    fail("Safe metadata access did not prevent a parent-directory escape")
                try:
                    self._stat_beneath(probe_fd, "link")
                except OSError:
                    pass
                else:
                    fail("Safe metadata access did not reject symbolic links")
                searchable_fd = os.open("searchable", directory_flags, dir_fd=probe_fd)
                os.close(searchable_fd)
                unrestricted_link = os.open(
                    "link", os.O_RDONLY | getattr(os, "O_CLOEXEC", 0), dir_fd=probe_fd
                )
                os.close(unrestricted_link)
                try:
                    followed = self._open_beneath(probe_fd, "link", link_flags)
                except OSError:
                    pass
                else:
                    os.close(followed)
                    fail("Safe documentation file access did not reject symbolic links")
            finally:
                os.close(probe_fd)

    def _resolve(self, path):
        if not isinstance(path, str) or path.startswith("/"):
            raise OutsideCheckout()

        pending = list(path.split("/"))
        directories = [os.dup(self.root_fd)]
        resolved = []
        expansions = 0
        try:
            while pending:
                component = pending.pop(0)
                if component in ("", "."):
                    continue
                if component == "..":
                    if len(directories) == 1:
                        raise OutsideCheckout()
                    os.close(directories.pop())
                    resolved.pop()
                    continue

                parent_fd = directories[-1]
                try:
                    target = os.readlink(component, dir_fd=parent_fd)
                except OSError as error:
                    if error.errno != errno.EINVAL:
                        raise
                else:
                    expansions += 1
                    if expansions > 40:
                        raise OSError(errno.ELOOP, os.strerror(errno.ELOOP), path)
                    if os.path.isabs(target):
                        normalized = os.path.normpath(os.path.realpath(target))
                        try:
                            if os.path.commonpath((self.root_path, normalized)) != self.root_path:
                                raise OutsideCheckout()
                        except ValueError:
                            raise OutsideCheckout()
                        target = os.path.relpath(normalized, self.root_path)
                        while len(directories) > 1:
                            os.close(directories.pop())
                        resolved.clear()
                    pending = target.split("/") + pending
                    continue

                if pending:
                    try:
                        directory_fd = os.open(
                            component,
                            self.directory_flags
                            | os.O_DIRECTORY
                            | os.O_NOFOLLOW
                            | getattr(os, "O_CLOEXEC", 0),
                            dir_fd=parent_fd,
                        )
                    except OSError as error:
                        if error.errno == errno.ELOOP:
                            raise OutsideCheckout() from error
                        raise
                    directories.append(directory_fd)
                    resolved.append(component)
                else:
                    resolved.append(component)
                    return "/".join(resolved)
            return "/".join(resolved) or "."
        finally:
            while directories:
                os.close(directories.pop())

    def _open(self, path):
        resolved = self._resolve(path)
        try:
            descriptor = self._open_beneath(self.root_fd, resolved)
        except OSError as error:
            containment_errors = {errno.ELOOP, errno.EXDEV}
            if sys.platform == "darwin":
                containment_errors.add(getattr(errno, "ENOTCAPABLE", 107))
            if error.errno in containment_errors:
                raise OutsideCheckout() from error
            raise
        try:
            metadata = os.fstat(descriptor)
            if not stat.S_ISREG(metadata.st_mode) and not stat.S_ISDIR(metadata.st_mode):
                raise OSError(errno.EINVAL, "Markdown target is not a regular file or directory", path)
            return descriptor, metadata
        except BaseException:
            os.close(descriptor)
            raise

    def _stat_beneath(self, directory_fd, path):
        if sys.platform.startswith("linux"):
            descriptor = self._open_beneath(directory_fd, path, self.stat_flags)
            try:
                return os.fstat(descriptor).st_mode
            finally:
                os.close(descriptor)

        class DarwinStatPrefix(ctypes.Structure):
            _fields_ = [
                ("device", ctypes.c_int32),
                ("mode", ctypes.c_uint16),
                ("links", ctypes.c_uint16),
                ("inode", ctypes.c_uint64),
            ]

        buffer = ctypes.create_string_buffer(256)
        result = self.fstatat(
            ctypes.c_int(directory_fd),
            ctypes.c_char_p(os.fsencode(path)),
            ctypes.cast(buffer, ctypes.c_void_p),
            ctypes.c_int(0x2000 | 0x0800),  # AT_RESOLVE_BENEATH | AT_SYMLINK_NOFOLLOW_ANY
        )
        if result < 0:
            number = ctypes.get_errno()
            raise OSError(number, os.strerror(number), path)
        mode = ctypes.cast(buffer, ctypes.POINTER(DarwinStatPrefix)).contents.mode
        if stat.S_ISLNK(mode):
            raise OSError(errno.ELOOP, os.strerror(errno.ELOOP), path)
        return mode

    def read(self, path):
        descriptor, metadata = self._open(path)
        try:
            if not stat.S_ISREG(metadata.st_mode):
                raise OSError(errno.EISDIR, os.strerror(errno.EISDIR), path)
            chunks = []
            while True:
                chunk = os.read(descriptor, 65536)
                if not chunk:
                    break
                chunks.append(chunk)
            return b"".join(chunks).decode("utf-8", errors="replace")
        finally:
            os.close(descriptor)

    def stat(self, path):
        resolved = self._resolve(path)
        try:
            mode = self._stat_beneath(self.root_fd, resolved)
        except OSError as error:
            containment_errors = {errno.ELOOP, errno.EXDEV}
            if sys.platform == "darwin":
                containment_errors.add(getattr(errno, "ENOTCAPABLE", 107))
            if error.errno in containment_errors:
                raise OutsideCheckout() from error
            raise
        if not stat.S_ISREG(mode) and not stat.S_ISDIR(mode):
            raise OSError(errno.EINVAL, "Markdown target is not a regular file or directory", path)
        return {"isDirectory": stat.S_ISDIR(mode)}

    def close(self):
        os.close(self.root_fd)


def send(response):
    sys.stdout.write(json.dumps(response, separators=(",", ":")) + "\n")
    sys.stdout.flush()


def error_result(error):
    if isinstance(error, OutsideCheckout):
        return {"code": "EOUTSIDE", "message": "Path points outside the checkout"}
    code = errno.errorcode.get(getattr(error, "errno", None), "EIO")
    return {"code": code, "message": str(error)}


def main():
    try:
        filesystem = RootedFilesystem(sys.argv[1])
    except BaseException as error:
        send({"ready": False, "error": {"message": str(error)}})
        return 1
    send({"ready": True})
    for raw in sys.stdin:
        try:
            request = json.loads(raw)
            operation = request["operation"]
            if operation == "close":
                filesystem.close()
                send({"id": request["id"], "ok": True, "result": None})
                return 0
            path = request["path"]
            if operation == "read":
                result = filesystem.read(path)
            elif operation == "stat":
                result = filesystem.stat(path)
            else:
                raise ValueError(f"Unknown filesystem operation: {operation}")
            send({"id": request["id"], "ok": True, "result": result})
        except BaseException as error:
            send({"id": request.get("id"), "ok": False, "error": error_result(error)})
    filesystem.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
