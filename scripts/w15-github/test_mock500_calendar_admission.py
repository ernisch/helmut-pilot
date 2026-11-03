"""Synthetic new calendar-GO bindings; no Original, DB, job or model."""
import sys
sys.dont_write_bytecode = True
import copy
from datetime import datetime, timedelta, timezone
import hashlib
import json
import os
from pathlib import Path
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).parent))
import test_mock500_historical_source as historical


class CalendarAdmissionTests(unittest.TestCase):
    def setUp(self):
        historical.HistoricalSourceTests.setUpClass()
        self.helper = historical.HistoricalSourceTests()
        self.helper.setUp(); self.addCleanup(self.helper.doCleanups)
        self.base = self.helper._to_host_functional(self.helper.base)
        self.S = self.helper.S
        self.now = datetime(2026, 11, 3, 10, tzinfo=timezone.utc)
        self.base.approval['issuedAt'] = self.now.isoformat().replace('+00:00', 'Z')
        self.base.approval['expiresAt'] = (self.now + timedelta(hours=1)).isoformat().replace('+00:00', 'Z')

    def admit(self):
        b = self.base
        return self.S.validate_admission({**b.request, 'approval': b.approval}, b.end_envelope,
            compatibility_bridge=b.bridge_envelope, observed_context=b.observed, now=self.now)

    def test_exact_explicit_calendar_and_source_go_share_all_bindings(self):
        self.base.approval['simulationCalendar'] = self.S.SIMULATION_CALENDAR
        result = self.admit(); a = result['simulationCalendarAuthorization']; s = result['sourceReplayAuthorization']
        expected = {**s, 'schema': 'helmut-w15-isolated-mock-calendar-authorization/1',
                    'contract': self.S.SIMULATION_CALENDAR, 'historicalPricesOnly': True}
        self.assertEqual(a, expected)
        raw = json.dumps(self.base.approval, sort_keys=True, separators=(',', ':'), ensure_ascii=True, allow_nan=False).encode('ascii')
        self.assertEqual(a['approvalSHA256'], hashlib.sha256(raw).hexdigest())
        self.assertFalse(result['executionAuthority']); self.assertFalse(result['mock500Acceptance'])

    def test_environment_or_input_metadata_does_not_create_calendar_authority(self):
        self.base.request['simulationCalendarAuthorization'] = {'authorized': True}
        with patch.dict(os.environ, {'HELMUT_MOCK_SIMULATION_CALENDAR': self.S.SIMULATION_CALENDAR}):
            self.assertNotIn('simulationCalendarAuthorization', self.admit())

    def test_calendar_without_source_or_wrong_version_is_rejected(self):
        for key, value in (('sourceContract', None), ('simulationCalendar', 'helmut-w15-mock-simulation-calendar/2')):
            self.base.approval['simulationCalendar'] = self.S.SIMULATION_CALENDAR
            old = copy.deepcopy(self.base.approval)
            if value is None:
                self.base.approval.pop(key)
            else:
                self.base.approval[key] = value
            with self.subTest(key=key), self.assertRaises(self.S.StartRejected):
                self.admit()
            self.base.approval = old

    def test_ordinary_or_diagnostic_mode_cannot_receive_new_calendar(self):
        self.base.approval['simulationCalendar'] = self.S.SIMULATION_CALENDAR
        for mode in (self.S.MODE, self.S.MATERIALS):
            old = copy.deepcopy(self.base.request), copy.deepcopy(self.base.observed), copy.deepcopy(self.base.approval)
            self.base.request['mode'] = self.base.observed['mode'] = self.base.approval['mode'] = mode
            with self.subTest(mode=mode), self.assertRaises(self.S.StartRejected):
                self.admit()
            self.base.request, self.base.observed, self.base.approval = old

    def test_expired_changed_nonce_or_extra_approval_field_remains_rejected(self):
        self.base.approval['simulationCalendar'] = self.S.SIMULATION_CALENDAR
        for mutation in ('expired', 'nonce', 'extra'):
            old = copy.deepcopy(self.base.approval)
            if mutation == 'expired': self.base.approval['expiresAt'] = self.base.approval['issuedAt']
            elif mutation == 'nonce': self.base.approval['nonce'] = '00000000-0000-4000-8000-000000000000'
            else: self.base.approval['currentProviderPricesAccepted'] = True
            with self.subTest(mutation=mutation), self.assertRaises(self.S.StartRejected):
                self.admit()
            self.base.approval = old


class CalendarExternalDispatchTests(unittest.TestCase):
    def setUp(self):
        import test_mock500_full_dispatch as fixture
        self.fixture = fixture
        self.case = fixture.MockFullDispatchChecks(); self.case.setUp(); self.addCleanup(self.case.doCleanups)
        self.D = fixture.D
        self.scope = self.D.S.host().SCOPE
        self.case.go['scope'] = self.scope
        self.case.request['limits'] = self.D.W.limits(self.D.HOST_FUNCTIONAL)
        self.case.request['approval'].update(mode=self.D.HOST_FUNCTIONAL, scope=self.scope,
            limits=self.case.request['limits'], resourceContract=self.D.S.host().CONTRACT,
            sourceContract=self.D.S.SOURCE_REPLAY, simulationCalendar=self.D.S.SIMULATION_CALENDAR)

    def bind(self, day):
        now = datetime.fromisoformat(day + 'T10:00:00+00:00')
        for target in (self.case.go, self.case.request['approval']):
            target['issuedAt'] = now.isoformat(timespec='seconds').replace('+00:00', 'Z')
            target['expiresAt'] = (now + timedelta(hours=1)).isoformat(timespec='seconds').replace('+00:00', 'Z')
        self.case.go['requestSHA256'] = self.D.digest(self.case.request)
        return now

    def validate(self, now):
        self.D.validate_approval(self.case.go, self.fixture.TARGET, self.fixture.LAUNCHER, self.case.request, now)

    def test_all_seven_november_days_transport_both_contracts_under_request_hash(self):
        for day in range(1, 8):
            with self.subTest(day=day): self.validate(self.bind('2026-11-' + str(day).zfill(2)))

    def test_outside_approved_dates_wrong_contract_or_unbound_mutation_is_rejected(self):
        for day in ('2026-10-31', '2026-11-08'):
            with self.subTest(day=day), self.assertRaises(ValueError): self.validate(self.bind(day))
        now = self.bind('2026-11-03')
        self.case.request['approval']['simulationCalendar'] = 'wrong-version'
        with self.assertRaises(self.D.DispatchRejected): self.validate(now)
        self.case.go['requestSHA256'] = self.D.digest(self.case.request)
        with self.assertRaises(self.D.DispatchRejected): self.validate(now)
        self.case.request['approval']['simulationCalendar'] = self.D.S.SIMULATION_CALENDAR
        self.case.request['approval'].pop('sourceContract')
        self.case.go['requestSHA256'] = self.D.digest(self.case.request)
        with self.assertRaises(self.D.DispatchRejected): self.validate(now)


if __name__ == '__main__':
    unittest.main()
