import importlib.util, tempfile, unittest
from pathlib import Path

spec=importlib.util.spec_from_file_location('budget_install',Path(__file__).with_name('install.py'))
I=importlib.util.module_from_spec(spec);spec.loader.exec_module(I)

class InstallRuleTests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name)
  self.rules=self.root/'.codex/rules/default.rules';self.launcher=self.root/'bin/helmut-deepseek'
 def tearDown(self):self.tmp.cleanup()
 def test_adds_exact_rule_and_preserves_existing_rules(self):
  self.rules.parent.mkdir(parents=True);self.rules.write_text('prefix_rule(pattern=["git", "status"], decision="allow")\n')
  self.assertTrue(I.ensure_codex_launcher_rule(self.rules,self.launcher))
  text=self.rules.read_text()
  self.assertIn('pattern=["'+str(self.launcher)+'"]',text)
  self.assertIn('prefix_rule(pattern=["git", "status"], decision="allow")',text)
  self.assertNotIn('pattern=["'+str(self.root/'bin/other')+'"]',text)
 def test_second_install_is_idempotent(self):
  self.assertTrue(I.ensure_codex_launcher_rule(self.rules,self.launcher))
  first=self.rules.read_text()
  self.assertFalse(I.ensure_codex_launcher_rule(self.rules,self.launcher))
  self.assertEqual(self.rules.read_text(),first)
  self.assertEqual(first.count(I.RULE_BEGIN),1)
 def test_existing_unmarked_exact_allow_is_not_duplicated(self):
  self.rules.parent.mkdir(parents=True)
  self.rules.write_text('prefix_rule(\n    pattern=["'+str(self.launcher)+'"],\n    decision="allow",\n)\n')
  before=self.rules.read_text()
  self.assertFalse(I.ensure_codex_launcher_rule(self.rules,self.launcher))
  self.assertEqual(self.rules.read_text(),before)

if __name__=='__main__':unittest.main()
