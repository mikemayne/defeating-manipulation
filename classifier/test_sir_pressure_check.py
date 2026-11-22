import unittest
from unittest.mock import patch

from sir_pressure_check import check, check_status, validate


class EvidenceTest(unittest.TestCase):
    item = {"text": "It's all in your head.", "before": "She said she heard the alarm."}

    def result(self, **overrides):
        return {
            "fear": {"status": "absent", "choice": "", "outcome": "", "leverage": ""},
            "doubt": {"status": "present", "judgement_context": "heard the alarm",
                      "judgement": "", "dismissal": "all in your head", **overrides},
        }

    def test_context_can_name_the_judgement(self):
        self.assertEqual(check_status(validate(self.item, self.result())), "present")

    def test_dismissal_has_to_appear_in_target(self):
        with self.assertRaises(ValueError):
            validate(self.item, self.result(dismissal="heard the alarm"))

    def test_judgement_has_one_source(self):
        with self.assertRaises(ValueError):
            validate(self.item, self.result(judgement="your head"))

    @patch("sir_pressure_check.check_batch")
    def test_only_invalid_items_are_retried(self, send):
        accepted = self.result()
        second = {"text": "No."}
        send.side_effect = [[None, accepted], [accepted]]
        self.assertEqual(check([self.item, second], "local"), [accepted, accepted])
        send.assert_called_with([self.item], "local")
        self.assertEqual(send.call_count, 2)

    def test_invalid_evidence_abstains(self):
        self.assertEqual(check_status(None), "uncertain")


if __name__ == "__main__":
    unittest.main()
