import itertools
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import Mock
from import_progress import ImportProgress,run_download

class ImportProgressTests(unittest.TestCase):
    def test_bytes_and_completed_stages_drive_monotonic_progress_below_100(self):
        sender=Mock();clock=itertools.count();progress=ImportProgress(sender,lambda:next(clock))
        progress.report(1,'starting')
        progress.download_line('KM_PROGRESS:500:1000:NA')
        self.assertEqual(sender.call_args.args[0]['progress'],40)
        progress.download_line('KM_PROGRESS:1000:1000:NA')
        self.assertEqual(sender.call_args.args[0]['progress'],79)
        progress.download_line('KM_PROGRESS:50:1000:NA')
        self.assertEqual(sender.call_args.args[0]['progress'],79)
        for percent,stage in [(80,'preparing'),(85,'uploading'),(92,'artwork'),(96,'lyrics'),(99,'saving')]:progress.report(percent,stage)
        values=[call.args[0]['progress'] for call in sender.call_args_list]
        self.assertEqual(values,sorted(values));self.assertEqual(values[-1],99)
        self.assertNotIn(100,values)

    def test_missing_totals_do_not_invent_progress_and_estimates_are_supported(self):
        sender=Mock();progress=ImportProgress(sender,lambda:10)
        for line in ['noise','KM_PROGRESS:100:NA:NA','KM_PROGRESS:bad:200:NA','KM_PROGRESS:100:0:NA']:progress.download_line(line)
        sender.assert_not_called()
        progress.download_line('KM_PROGRESS:250:NA:1000')
        self.assertEqual(sender.call_args.args[0]['progress'],20)

    def test_callbacks_are_throttled_and_telemetry_failure_does_not_fail_import(self):
        sender=Mock();now=[0];progress=ImportProgress(sender,lambda:now[0])
        progress.report(2,'downloading');progress.report(30,'downloading');self.assertEqual(sender.call_count,1)
        now[0]=1;progress.report(30,'downloading');self.assertEqual(sender.call_count,2)
        sender.side_effect=RuntimeError('private transport failure')
        with self.assertLogs('king_sports.music',level='WARNING') as logs:progress.report(80,'preparing')
        self.assertNotIn('private transport failure',' '.join(logs.output))
        sender.side_effect=None;progress.report(80,'preparing');self.assertEqual(progress.percent,80)

    def test_streamed_downloader_output_is_read_without_exposing_stderr(self):
        with tempfile.TemporaryDirectory() as tmp:
            sender=Mock();clock=itertools.count();progress=ImportProgress(sender,lambda:next(clock))
            script="print('KM_PROGRESS:500:1000:NA',flush=True);print('KM_PROGRESS:1000:1000:NA',flush=True)"
            run_download([sys.executable,'-c',script,'--','source'],Path(tmp),progress,timeout=5)
            self.assertEqual(sender.call_args.args[0]['progress'],79)

    def test_failed_and_timed_out_downloads_raise_without_leaking_credentials(self):
        with tempfile.TemporaryDirectory() as tmp:
            script="import sys;sys.stderr.write('Requested format is not available Cookie: very-private-value');sys.exit(1)"
            with self.assertLogs('king_sports.music',level='WARNING') as logs:
                with self.assertRaises(RuntimeError):run_download([sys.executable,'-c',script,'--cookies','/private/session','--','source'],Path(tmp),ImportProgress(Mock()),timeout=5)
            self.assertNotIn('very-private-value',' '.join(logs.output))
            self.assertIn('Requested source format',' '.join(logs.output))
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaises(subprocess.TimeoutExpired):run_download([sys.executable,'-c','import time;time.sleep(10)','--','source'],Path(tmp),ImportProgress(Mock()),timeout=0)

if __name__=='__main__':unittest.main()
