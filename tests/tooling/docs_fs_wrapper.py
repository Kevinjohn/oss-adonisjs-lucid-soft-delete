#!/usr/bin/env python3
"""Test launcher that adds controlled barriers around the real docs_fs helper."""

import errno
import importlib.util
import os
import sys
import time


def main():
    helper_path, root = sys.argv[1], sys.argv[2]
    sys.dont_write_bytecode = True
    spec = importlib.util.spec_from_file_location("docs_fs_under_test", helper_path)
    helper = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = helper
    spec.loader.exec_module(helper)

    original_send = helper.send

    def controlled_send(response):
        failure_mode = os.environ.get("DOCS_FS_TEST_RESPONSE_FAILURE")
        if not response.get("ready") and failure_mode == "invalid":
            sys.stdout.write("not-json\n")
            sys.stdout.flush()
            return
        if not response.get("ready") and failure_mode == "uncoded":
            original_send(
                {
                    "id": response["id"],
                    "ok": False,
                    "error": {"message": "uncoded failure"},
                }
            )
            return
        original_send(response)

    helper.send = controlled_send

    original_open = os.open
    active = {"filesystem": None, "operation": None, "path": None}

    def pause(phase, operation, path):
        if (
            operation != os.environ.get("DOCS_FS_TEST_BARRIER_OPERATION")
            or phase != os.environ.get("DOCS_FS_TEST_BARRIER_PHASE")
            or path != os.environ.get("DOCS_FS_TEST_BARRIER_TARGET")
        ):
            return
        barrier = os.environ["DOCS_FS_TEST_BARRIER_DIR"]
        ready = os.path.join(barrier, f"{phase}-ready")
        resume = os.path.join(barrier, f"{phase}-resume")
        descriptor = original_open(ready, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        os.close(descriptor)
        deadline = time.monotonic() + 10
        while not os.path.exists(resume):
            if time.monotonic() >= deadline:
                raise TimeoutError("Documentation filesystem test barrier timed out")
            time.sleep(0.005)

    def observed_open(path, flags, *args, **kwargs):
        descriptor = original_open(path, flags, *args, **kwargs)
        filesystem = active["filesystem"]
        target = active["path"]
        if (
            filesystem is not None
            and active["operation"] == "read"
            and os.environ.get("DOCS_FS_TEST_BARRIER_PHASE") == "after-ancestor-open"
            and isinstance(target, str)
            and "/" in target
            and path == target.split("/", 1)[0]
            and flags & os.O_DIRECTORY
        ):
            pause("after-ancestor-open", active["operation"], target)
        return descriptor

    def wrap_operation(operation, original):
        def wrapped(filesystem, path):
            previous = (active["filesystem"], active["operation"], active["path"])
            active.update(filesystem=filesystem, operation=operation, path=path)
            try:
                if (
                    operation == os.environ.get("DOCS_FS_TEST_FAIL_OPERATION")
                    and path == os.environ.get("DOCS_FS_TEST_FAIL_TARGET")
                ):
                    raise OSError(errno.EACCES, os.strerror(errno.EACCES), path)
                return original(filesystem, path)
            finally:
                active.update(
                    filesystem=previous[0], operation=previous[1], path=previous[2]
                )

        return wrapped

    for operation in ("read", "stat"):
        original = getattr(helper.RootedFilesystem, operation)
        setattr(helper.RootedFilesystem, operation, wrap_operation(operation, original))

    for method in ("_linux_open_beneath", "_darwin_open_beneath"):
        original = getattr(helper.RootedFilesystem, method)

        def wrap_final_open(original_method):
            def wrapped(filesystem, directory_fd, path, flags=None):
                pause("before-final-open", active["operation"], active["path"])
                return original_method(filesystem, directory_fd, path, flags)

            return wrapped

        setattr(helper.RootedFilesystem, method, wrap_final_open(original))

    original_init = helper.RootedFilesystem.__init__

    def init_with_open_observer(filesystem, root):
        original_init(filesystem, root)
        os.open = observed_open

    helper.RootedFilesystem.__init__ = init_with_open_observer

    sys.argv = [helper_path, root]
    return helper.main()


if __name__ == "__main__":
    raise SystemExit(main())
