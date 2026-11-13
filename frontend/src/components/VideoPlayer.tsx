import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { VideoOff } from "lucide-react";
import { apiUrl } from "../lib/api";
import type { VideoItem } from "../lib/types";
import { cn } from "../lib/utils";

export interface PlayerHandle { seek: (seconds: number) => void }

/** Plain <video> pointed at the API's Range-enabled stream. Reports currentTime while playing or seeking. */
export const VideoPlayer = forwardRef<PlayerHandle, {
  video: VideoItem; onTime?: (t: number) => void; className?: string; videoClassName?: string;
}>(function VideoPlayer({ video, onTime, className, videoClassName }, ref) {
  const el = useRef<HTMLVideoElement>(null);
  const [failed, setFailed] = useState(false);
  useImperativeHandle(ref, () => ({ seek: (s) => { if (el.current) { el.current.currentTime = s; onTime?.(s); } } }), [onTime]);

  useEffect(() => { setFailed(false); }, [video.id]);

  useEffect(() => {
    const v = el.current;
    if (!v || !onTime) return;
    let raf = 0;
    const loop = () => { onTime(v.currentTime); raf = requestAnimationFrame(loop); };
    const start = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(loop); };
    const stop = () => { cancelAnimationFrame(raf); onTime(v.currentTime); };
    const sync = () => onTime(v.currentTime);
    v.addEventListener("play", start); v.addEventListener("pause", stop); v.addEventListener("ended", stop);
    v.addEventListener("seeked", sync); v.addEventListener("seeking", sync); v.addEventListener("loadedmetadata", sync);
    return () => {
      cancelAnimationFrame(raf);
      v.removeEventListener("play", start); v.removeEventListener("pause", stop); v.removeEventListener("ended", stop);
      v.removeEventListener("seeked", sync); v.removeEventListener("seeking", sync); v.removeEventListener("loadedmetadata", sync);
    };
  }, [onTime, video.id]);

  if (!video.stream_url) {
    return (
      <div className={cn("grid aspect-video place-items-center rounded-md bg-ink-950 text-center", className)}>
        <div className="text-ink-400"><VideoOff className="mx-auto mb-2" aria-hidden />This video file is not on the server.</div>
      </div>
    );
  }
  return (
    <div className={cn("relative overflow-hidden rounded-md bg-black", className)}>
      <video key={video.id} ref={el} src={apiUrl(video.stream_url)} controls preload="metadata" playsInline
        onError={() => setFailed(true)} className={cn("block h-auto w-full", videoClassName)} aria-label={video.title} />
      {failed && (
        <div role="alert" className="absolute inset-0 grid place-items-center bg-ink-950/90 p-6 text-center text-sm text-ink-200">
          <div><VideoOff className="mx-auto mb-2 text-danger" aria-hidden />The video could not be loaded. Check that the API is running and the file exists.</div>
        </div>
      )}
    </div>
  );
});
