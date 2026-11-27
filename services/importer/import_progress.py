"""Byte-driven import progress and credential-safe command diagnostics."""
import logging
import math
import subprocess
import time

STAGES = {'starting', 'downloading', 'preparing', 'uploading', 'artwork', 'lyrics', 'saving'}


def media_failure(arguments, stderr):
    diagnostic = stderr[-2000:]
    if '--cookies' in arguments:
        diagnostic = 'Authenticated download failed; detailed output withheld'
        for needle, message in (("challenge solving failed", "YouTube JavaScript challenge could not be solved"), ("requested format is not available", "Requested source format is unavailable"), ("only images are available", "Source exposes images but no playable streams"), ("not a bot", "YouTube still requires sign-in verification"), ("http error 403", "Source returned HTTP 403"), ("po token", "Source requires an additional playback token"), ("cookies are no longer valid", "YouTube session cookies are no longer valid")):
            if needle in stderr.lower():
                diagnostic = message
                break
    logging.getLogger('king_sports.music').warning('Media command failed (%s): %s', arguments[0], diagnostic)
    raise RuntimeError('Media processing failed')


class ImportProgress:
    def __init__(self, send, clock=time.monotonic):
        self.send, self.clock = send, clock
        self.percent, self.stage, self.sent_at = -1, None, -math.inf

    def report(self, percent, stage):
        if stage not in STAGES or not math.isfinite(percent):
            return
        percent = max(self.percent, min(99, max(0, int(percent))))
        now = self.clock()
        if stage == self.stage and (percent <= self.percent or percent-self.percent < 2 or now-self.sent_at < 1):
            return
        try:
            self.send({'status': 'processing', 'progress': percent, 'stage': stage})
        except Exception:
            # A missed telemetry update must not discard an otherwise valid import.
            logging.getLogger('king_sports.music').warning('Import progress update unavailable')
            return
        self.percent, self.stage, self.sent_at = percent, stage, now

    def download_line(self, line):
        if not line.startswith('KM_PROGRESS:'):
            return
        try:
            downloaded, total, estimate = line.strip().split(':')[1:4]
            downloaded = float(downloaded)
            sizes = [float(value) for value in (total, estimate) if value not in ('NA', 'None', '', 'null')]
            total = sizes[0] if sizes else 0
            if total > 0 and math.isfinite(total) and math.isfinite(downloaded):
                self.report(1 + min(1, max(0, downloaded/total))*78, 'downloading')
        except (ValueError, IndexError):
            return


def run_download(arguments, directory, progress, timeout=540):
    # yt-dlp stdout is byte counts only; raw stderr stays in temporary storage.
    split = arguments.index('--')
    command = [*arguments[:split], '--progress', '--newline', '--progress-delta', '1', '--progress-template', 'download:KM_PROGRESS:%(progress.downloaded_bytes)s:%(progress.total_bytes)s:%(progress.total_bytes_estimate)s', *arguments[split:]]
    with (directory/'download.progress').open('w') as output, (directory/'download.stderr').open('w') as error, (directory/'download.progress').open('r') as reader:
        process = subprocess.Popen(command, stdout=output, stderr=error, text=True)
        start, buffered = time.monotonic(), ''
        def drain():
            nonlocal buffered
            buffered += reader.read()
            lines = buffered.split('\n')
            buffered = lines.pop()
            for line in lines:
                progress.download_line(line)
        try:
            while process.poll() is None:
                drain()
                if time.monotonic()-start > timeout and process.poll() is None:
                    raise subprocess.TimeoutExpired(command, timeout)
                time.sleep(.5)
            drain()
            if buffered:
                progress.download_line(buffered)
            if process.returncode:
                error.flush()
                media_failure(command, (directory/'download.stderr').read_text(errors='replace'))
        finally:
            if process.poll() is None:
                process.kill()
            process.wait()
