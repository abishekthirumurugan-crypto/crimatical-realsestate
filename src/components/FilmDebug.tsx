/**
 * A readout of what the film is actually doing, for a device I cannot attach a
 * debugger to.
 *
 * Off unless the URL carries `?debug`, so it costs nothing in normal use and
 * cannot be reached by accident. Everything it shows is read live off the media
 * element rather than from React state, because the question it exists to
 * answer — "the stage is black, why" — is about the element disagreeing with
 * what the component believes.
 *
 * Open `/?debug` on the phone and screenshot it. The fields that matter, in the
 * order they fail:
 *
 *   source     which cut was chosen, and whether it is a blob: or a real URL
 *   network    2 = still loading, 3 = it gave up with no source at all
 *   ready      0 = nothing, 1 = duration only, 2+ = there is a frame to draw
 *   error      the element's own MediaError, which is otherwise invisible
 *   painted    whether anything has actually reached the screen
 *   mirror     on WebKit, whether the canvas has non-black pixels in it
 */

import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';

const READY_STATE = ['0 nothing', '1 metadata', '2 current', '3 future', '4 enough'];
const NETWORK_STATE = ['0 empty', '1 idle', '2 loading', '3 NO SOURCE'];
const MEDIA_ERROR = ['', '1 aborted', '2 network', '3 DECODE', '4 SRC UNSUPPORTED'];

export function isFilmDebug(): boolean {
  return typeof location !== 'undefined' && /(^|[?&])debug\b/.test(location.search);
}

interface Row {
  label: string;
  value: string;
  bad?: boolean;
}

export default function FilmDebug({ videoRef }: { videoRef: RefObject<HTMLVideoElement | null> }) {
  const [rows, setRows] = useState<Row[]>([]);
  const paintedRef = useRef(false);

  useEffect(() => {
    const read = (): Row[] => {
      const canvasOnly = document.querySelector('[data-scroll-frames]');
      const v = videoRef.current;

      // The iPhone path has no media element at all — it is stills on a canvas.
      // Report on that instead of claiming the video failed to mount.
      if (!v) {
        const c = document.querySelector<HTMLCanvasElement>('[data-scroll-frames] canvas');
        let lit = 0;
        let size = 'none';
        if (c && c.width) {
          size = `${c.width}x${c.height}`;
          const ctx = c.getContext('2d');
          if (ctx)
            for (const fx of [0.25, 0.5, 0.75])
              for (const fy of [0.25, 0.5, 0.75]) {
                const d = ctx.getImageData(Math.floor(c.width * fx), Math.floor(c.height * fy), 1, 1).data;
                if (d[0] + d[1] + d[2] > 24) lit++;
              }
        }
        return [
          { label: 'mode', value: canvasOnly ? 'IMAGE SEQUENCE (iOS)' : 'no film mounted', bad: !canvasOnly },
          { label: 'canvas', value: size, bad: size === 'none' },
          { label: 'picture', value: `${lit}/9 sample points lit`, bad: lit === 0 },
          { label: 'loader', value: document.querySelector('.loader') ? 'still up' : 'gone' },
          { label: 'ua', value: navigator.userAgent.slice(0, 46) },
        ];
      }

      const src = v.currentSrc || '(none)';
      const isBlob = src.startsWith('blob:');
      const canvas = document.querySelector<HTMLCanvasElement>('[data-scroll-video] canvas');

      // Does the canvas actually hold a picture, or is it still blank? Sample a
      // few pixels rather than the whole frame.
      let mirror = 'not used (non-WebKit)';
      if (canvas) {
        try {
          const ctx = canvas.getContext('2d');
          if (!ctx || !canvas.width) mirror = 'canvas has no size yet';
          else {
            const pts = [0.25, 0.5, 0.75];
            let lit = 0;
            for (const fx of pts)
              for (const fy of pts) {
                const d = ctx.getImageData(
                  Math.floor(canvas.width * fx),
                  Math.floor(canvas.height * fy),
                  1,
                  1,
                ).data;
                if (d[0] + d[1] + d[2] > 24) lit++;
              }
            mirror = `${canvas.width}x${canvas.height}, ${lit}/9 sample points lit`;
            if (lit > 0) paintedRef.current = true;
          }
        } catch (e) {
          mirror = 'readback blocked: ' + (e as Error).name;
        }
      }

      if (v.readyState >= 2) paintedRef.current = true;

      return [
        { label: 'source', value: (isBlob ? 'BLOB  ' : 'url  ') + src.split('/').pop()?.slice(0, 28), bad: isBlob },
        { label: 'size', value: v.videoWidth ? `${v.videoWidth}x${v.videoHeight}` : 'unknown', bad: !v.videoWidth },
        { label: 'duration', value: Number.isFinite(v.duration) ? v.duration.toFixed(2) + 's' : 'NOT FINITE', bad: !Number.isFinite(v.duration) },
        { label: 'network', value: NETWORK_STATE[v.networkState] ?? String(v.networkState), bad: v.networkState === 3 },
        { label: 'ready', value: READY_STATE[v.readyState] ?? String(v.readyState), bad: v.readyState < 2 },
        { label: 'error', value: v.error ? `${MEDIA_ERROR[v.error.code]} ${v.error.message || ''}` : 'none', bad: !!v.error },
        { label: 'paused', value: String(v.paused) },
        { label: 'currentTime', value: v.currentTime.toFixed(2) + 's' },
        { label: 'buffered', value: v.buffered.length ? `${v.buffered.start(0).toFixed(1)}-${v.buffered.end(v.buffered.length - 1).toFixed(1)}s` : 'nothing', bad: !v.buffered.length },
        { label: 'mirror', value: mirror },
        { label: 'painted', value: paintedRef.current ? 'yes' : 'NO', bad: !paintedRef.current },
        { label: 'rVFC', value: 'requestVideoFrameCallback' in v ? 'supported' : 'missing' },
        { label: 'ua', value: navigator.userAgent.slice(0, 46) },
      ];
    };

    setRows(read());
    const id = window.setInterval(() => setRows(read()), 500);
    return () => window.clearInterval(id);
  }, [videoRef]);

  return (
    <div
      style={{
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 90,
        maxHeight: '52vh',
        overflowY: 'auto',
        padding: '10px 12px',
        background: 'rgba(0,0,0,0.86)',
        color: '#eee',
        font: '11px/1.45 ui-monospace, SFMono-Regular, Menlo, monospace',
        WebkitBackdropFilter: 'blur(6px)',
        backdropFilter: 'blur(6px)',
      }}
    >
      {rows.map((r) => (
        <div key={r.label} style={{ display: 'flex', gap: 8 }}>
          <span style={{ flex: '0 0 5.5rem', opacity: 0.55 }}>{r.label}</span>
          <span style={{ color: r.bad ? '#ff8f6b' : '#9be89b', wordBreak: 'break-all' }}>{r.value}</span>
        </div>
      ))}
    </div>
  );
}
