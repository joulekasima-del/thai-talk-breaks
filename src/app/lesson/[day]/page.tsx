"use client";

// Web App audio delivery prototype — PROTOTYPE, scoped to exactly Lesson 3
// and Day 8 (see deliverLesson.ts's WEB_APP_AUDIO_DAYS). Same Telegram Web
// App pattern as src/app/day29/page.tsx (initData -> ready()/expand(),
// fetch this page's content from a thin API route), stripped down to just
// what this prototype needs: no scroll/audio-sequencing, just a real HTML5
// <audio controls> element per clip, since the whole point is proving that
// a Web App's native <audio> isn't subject to Telegram's own
// sendAudio/sendDocument auto-continue-into-whatever's-next behavior.

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Script from "next/script";
import styles from "@/app/lesson/[day]/lessonAudio.module.css";
import type { LessonAudioContent } from "@/lib/lessonAudio/lessonAudioApi";

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        initData: string;
        ready: () => void;
        expand: () => void;
      };
    };
  }
}

type PageState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; content: LessonAudioContent };

export default function LessonAudioPage() {
  const params = useParams<{ day: string }>();
  const day = params?.day;

  const [initData, setInitData] = useState<string | null>(null);
  const [state, setState] = useState<PageState>({ status: "loading" });

  useEffect(() => {
    if (!initData || !day) return;
    let cancelled = false;

    fetch(`/api/lesson/${day}?initData=${encodeURIComponent(initData)}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((data: { content: LessonAudioContent }) => {
        if (!cancelled) setState({ status: "ready", content: data.content });
      })
      .catch(() => {
        if (!cancelled) setState({ status: "error", message: "Couldn't load this lesson's audio. Please try again from the chat." });
      });

    return () => {
      cancelled = true;
    };
  }, [initData, day]);

  return (
    <div className={styles.app}>
      <Script
        src="https://telegram.org/js/telegram-web-app.js"
        strategy="afterInteractive"
        onLoad={() => {
          const tg = window.Telegram?.WebApp;
          if (!tg) return;
          tg.ready();
          tg.expand();
          setInitData(tg.initData);
        }}
      />

      {state.status === "loading" && <p className={styles.loading}>Loading...</p>}
      {state.status === "error" && <p className={styles.loading}>{state.message}</p>}

      {state.status === "ready" && state.content.kind === "phrase" && (
        <div className={styles.card}>
          <p className={styles.karaoke}>{state.content.karaoke}</p>
          <p className={styles.meaning}>&quot;{state.content.englishMeaning}&quot;</p>
          <audio controls src={state.content.audioUrl} className={styles.audioPlayer} />
        </div>
      )}

      {state.status === "ready" && state.content.kind === "wordset" && (
        <div className={styles.card}>
          {state.content.words.map((word, index) => (
            <div key={index} className={styles.wordRow}>
              <p className={styles.karaoke}>{word.karaoke}</p>
              <p className={styles.meaning}>{word.meaning}</p>
              <audio controls src={word.audioUrl} className={styles.audioPlayer} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
