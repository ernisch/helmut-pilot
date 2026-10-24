#!/usr/bin/env python3
"""Reject foreign restoration context before any original-source SQL."""
import importlib.util
import unittest
from pathlib import Path
from unittest.mock import patch

spec=importlib.util.spec_from_file_location('restored_context_controller',Path(__file__).with_name('full500-controller.py'))
C=importlib.util.module_from_spec(spec);spec.loader.exec_module(C)

class RestoredSourceContextTest(unittest.TestCase):
    def test_foreign_or_missing_runtime_binding_stops_before_native_identity(self):
        expected=C.S.RUNTIME_BINDING_PIN
        for actual in [None,{**expected,'sha256':'0'*64},{**expected,'path':'/tmp/FOREIGN'}]:
            archived={'schema':'helmut-restored-original-resource-preflight/1',
              'status':'ACTUAL_RESTORED_FROZEN_SOURCE_READONLY_VERIFIED',
              'sourceEnvironment':{'runtimeBindingPin':actual}}
            with self.subTest(actual=actual),patch.object(C.C,'read_pin',return_value=archived), \
                 patch.object(C.S,'verify_runtime_binding',return_value=expected),patch.object(C.S,'identity')as sql:
                with self.assertRaisesRegex(RuntimeError,'preflight identity differs'):
                    C.original_preflight({'originalPreflightPin':{'TEST_ONLY':'NO_AUTHORITY'}})
                sql.assert_not_called()

    def test_unverified_restoration_status_stops_before_any_docker_or_sql(self):
        archived={'schema':'helmut-restored-original-resource-preflight/1','status':'PROPOSAL_ONLY',
                  'sourceEnvironment':{'runtimeBindingPin':C.S.RUNTIME_BINDING_PIN}}
        with patch.object(C.C,'read_pin',return_value=archived),patch.object(C.S,'verify_runtime_binding')as binding, \
             patch.object(C.S,'identity')as sql:
            with self.assertRaisesRegex(RuntimeError,'preflight identity differs'):
                C.original_preflight({'originalPreflightPin':{'TEST_ONLY':'NO_AUTHORITY'}})
            binding.assert_not_called();sql.assert_not_called()

if __name__=='__main__':unittest.main()
