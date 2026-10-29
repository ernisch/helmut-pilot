"""Only the newly exposed nested-runner path; no GPG, keys or network."""
import sys
sys.dont_write_bytecode = True
import importlib.util
import os
from pathlib import Path
import shutil
import socket
import tempfile
import unittest
from unittest.mock import patch

spec=importlib.util.spec_from_file_location('w15_short_receiver',Path(__file__).with_name('verify_receiver_key.py'))
V=importlib.util.module_from_spec(spec);spec.loader.exec_module(V)


class ReceiverSocketChecks(unittest.TestCase):
    def test_nested_worker_has_real_short_private_root_and_usable_agent_socket(self):
        with tempfile.TemporaryDirectory(prefix='w15-fictional-worker-') as temporary:
            parent=Path(temporary)/('nested-'+'a'*64)/'worker-temp'
            parent.mkdir(mode=0o700,parents=True)
            # The managed executor maps its shared /tmp owner to nobody;
            # GitHub's /tmp is root-owned. Keep the production requirement
            # strict and model only that platform-owned parent metadata.
            native_fstat=os.fstat; shared=Path('/tmp').stat()
            def observed(fd):
                value=native_fstat(fd)
                if (value.st_dev,value.st_ino)==(shared.st_dev,shared.st_ino):
                    fields=list(value);fields[4]=0
                    return os.stat_result(fields)
                return value
            with patch.object(V.os,'fstat',side_effect=observed):root=V.private_root(str(parent))
            self.addCleanup(shutil.rmtree,root)
            self.assertEqual(root.parent,Path('/tmp'))
            self.assertEqual(root.stat().st_uid,os.getuid())
            self.assertEqual(root.stat().st_mode&0o777,0o700)
            self.assertFalse(root.is_symlink())
            home=root/'gnupg';home.mkdir(mode=0o700)
            path=home/'S.gpg-agent.browser'
            self.assertLessEqual(len(os.fsencode(path)),107)
            with socket.socket(socket.AF_UNIX,socket.SOCK_STREAM) as server:server.bind(str(path))

    def test_short_existing_temp_keeps_existing_private_root_contract(self):
        with tempfile.TemporaryDirectory(prefix='rx-') as temporary:
            root=V.private_root(temporary)
            self.assertEqual(root.parent,Path(temporary))
            self.assertTrue(root.name.startswith('w15-existing-recipient-'))

    def test_untrusted_worker_parent_is_rejected_before_short_fallback(self):
        with tempfile.TemporaryDirectory(prefix='w15-fictional-unsafe-') as temporary:
            parent=Path(temporary)/('nested-'+'a'*64);parent.mkdir(mode=0o777);parent.chmod(0o777)
            with self.assertRaises(V.ReceiverError):V.private_root(str(parent))


if __name__=='__main__':unittest.main()
