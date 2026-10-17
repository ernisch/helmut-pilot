#!/usr/bin/env python3
"""Pure pre-claim regression guards. No Docker, DB, GO or workload execution."""
import importlib.util
import unittest
from pathlib import Path

s=importlib.util.spec_from_file_location('owner_policy',Path(__file__).with_name('isolation.py'))
policy=importlib.util.module_from_spec(s);s.loader.exec_module(policy)

class OwnerPolicyTest(unittest.TestCase):
    def test_explicit_preservation_declaration_required(self):
        for owner in [{},{'allowDispose':True},{'allowDispose':None},
                      {'allowDispose':0},{'allowDispose':'false'}]:
            with self.subTest(owner=owner):
                with self.assertRaisesRegex(RuntimeError,'explicit allowDispose=false'):
                    policy.verify_fixture_owner_policy(owner)

    def test_explicit_false_is_accepted(self):
        policy.verify_fixture_owner_policy({'allowDispose':False})

if __name__=='__main__':unittest.main()
