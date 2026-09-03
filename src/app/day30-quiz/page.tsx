"use client";

// Day 30 quiz — single continuous Web App page, replacing the old
// back-and-forth of native Telegram messages (per-question sendAudio +
// inline-keyboard buttons). Same Telegram Web App pattern as
// src/app/lesson/[day]/page.tsx and src/app/day29/page.tsx: initData ->
// ready()/expand(), fetch state from a thin API route
// (src/app/api/day30-quiz/route.ts).
//
// One question at a time: tapping an option plays that option's own audio
// via a real <audio> element (manual play() call on tap, not autoplay — the
// same mobile-webview autoplay caution as day29's page), immediately POSTs
// the answer (so it's saved as-you-go, not batched), and shows correctness
// feedback in-page. After feedback, "Next question" advances using the
// state the POST already returned — no extra GET round-trip needed to move
// on. After question 10, the completed state's score + badge render as the
// results screen.
//
// Resumability: every load re-fetches state from the server (GET), which is
// just whatever day30_quiz_progress currently says — closing and reopening
// the app always resumes at the right question, no client-side persistence.

import { useEffect, useRef, useState } from "react";
import Script from "next/script";
import styles from "@/app/day30-quiz/day30Quiz.module.css";
import type { Day30QuizState } from "@/lib/quiz/day30QuizApi";

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
  | { status: "ready"; quiz: Day30QuizState; answeredKind: string | null; feedbackMessage: string | null };

export default function Day30QuizPage() {
  const [initData, setInitData] = useState<string | null>(null);
  const [state, setState] = useState<PageState>({ status: "loading" });
  const [submitting, setSubmitting] = useState(false);
  // The state to advance into once the learner taps "Next question" / "See
  // results" — held separately from `state` so the answered option's
  // correct/incorrect highlight + feedback stay visible until they tap on.
  const [pendingNextState, setPendingNextState] = useState<Day30QuizState | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!initData) return;
    let cancelled = false;

    fetch(`/api/day30-quiz?initData=${encodeURIComponent(initData)}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((data: { state: Day30QuizState }) => {
        if (!cancelled) setState({ status: "ready", quiz: data.state, answeredKind: null, feedbackMessage: null });
      })
      .catch(() => {
        if (!cancelled) setState({ status: "error", message: "Couldn't load your quiz. Please try again from the chat." });
      });

    return () => {
      cancelled = true;
    };
  }, [initData]);

  const selectOption = async (option: { kind: string; text: string; audioUrl: string }) => {
    if (state.status !== "ready" || state.quiz.status !== "in_progress" || submitting || state.answeredKind) return;

    const audio = audioRef.current;
    if (audio) {
      audio.src = option.audioUrl;
      audio.play().catch(() => {
        // Autoplay can be blocked before the first user gesture — this call
        // itself is triggered by a tap, so it should normally succeed; if
        // not, the option's audio simply doesn't play, same graceful
        // degradation as day29's page.
      });
    }

    setSubmitting(true);
    setState({ ...state, answeredKind: option.kind, feedbackMessage: null });
    try {
      const res = await fetch("/api/day30-quiz", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ initData, questionIndex: state.quiz.questionIndex, kind: option.kind }),
      });
      if (!res.ok) {
        // Stale/out-of-order tap (409) or another error — re-fetch the real
        // state from the server rather than trusting local guesses.
        const refetch = await fetch(`/api/day30-quiz?initData=${encodeURIComponent(initData!)}`);
        const data = (await refetch.json()) as { state: Day30QuizState };
        setState({ status: "ready", quiz: data.state, answeredKind: null, feedbackMessage: null });
        return;
      }
      const data = (await res.json()) as { correct: boolean; feedbackMessage: string; state: Day30QuizState };
      setState((prev) =>
        prev.status === "ready"
          ? { status: "ready", quiz: prev.quiz, answeredKind: option.kind, feedbackMessage: data.feedbackMessage }
          : prev,
      );
      setPendingNextState(data.state);
    } finally {
      setSubmitting(false);
    }
  };

  const advance = () => {
    if (!pendingNextState) return;
    setState({ status: "ready", quiz: pendingNextState, answeredKind: null, feedbackMessage: null });
    setPendingNextState(null);
  };

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

      <audio ref={audioRef} />

      {state.status === "loading" && <p className={styles.loading}>Loading...</p>}
      {state.status === "error" && <p className={styles.loading}>{state.message}</p>}

      {state.status === "ready" && state.quiz.status === "in_progress" && (
        <div className={styles.card}>
          <p className={styles.progress}>
            Question {state.quiz.questionIndex}/{state.quiz.questionCount}
          </p>
          <p className={styles.question}>What did you hear?</p>
          <div className={styles.options}>
            {state.quiz.options.map((option) => {
              const isAnswered = state.answeredKind !== null;
              const isTapped = state.answeredKind === option.kind;
              const optionClass = [
                styles.option,
                isTapped && option.kind === "c" ? styles.optionCorrect : "",
                isTapped && option.kind !== "c" ? styles.optionIncorrect : "",
              ]
                .filter(Boolean)
                .join(" ");
              return (
                <button key={option.kind} type="button" className={optionClass} disabled={isAnswered} onClick={() => selectOption(option)}>
                  {option.text}
                </button>
              );
            })}
          </div>
          {state.feedbackMessage && (
            <>
              <p className={styles.feedback}>{state.feedbackMessage}</p>
              <button type="button" className={styles.nextButton} onClick={advance}>
                {pendingNextState?.status === "completed" ? "See results" : "Next question"}
              </button>
            </>
          )}
        </div>
      )}

      {state.status === "ready" && state.quiz.status === "completed" && (
        <div className={styles.card}>
          <p className={styles.resultsScore}>{state.quiz.scoreMessage}</p>
          <p className={styles.resultsBadge}>{state.quiz.badgeMessage}</p>
        </div>
      )}
    </div>
  );
}
