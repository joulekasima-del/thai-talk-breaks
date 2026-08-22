"use client";

// Day 29 living comic — Checkpoint 6. Genuinely new architecture in this
// codebase: everything else in the app is either a Telegram bot message or
// a cron job; this is the first real interactive page, opened as a
// Telegram Web App from the button deliverDay29Entry.ts sends.
//
// Scroll/audio behavior is driven off two small pieces of pure, unit-tested
// logic (src/lib/day29/audioSequencer.ts, comicContent.ts) plus one effect
// keyed on [soundOn, currentPage]: whenever either changes, the current
// page's audio sequence (re)starts from its own first speech — this single
// rule covers both "scrolled to a new page" and "toggled sound back on
// while on this page," matching day29-living-comic-spec.md's restart rule
// exactly (audio always matches whatever page is visible, and a
// re-enabled toggle restarts from the current page's first speech, never a
// different page's).

import { useCallback, useEffect, useRef, useState } from "react";
import Script from "next/script";
import styles from "@/app/day29/day29.module.css";
import {
  DAY29_STORY_PAGES,
  DAY29_TOTAL_PAGES,
  DAY29_QUEST_PAGE_NUMBER,
  DAY29_QUEST_QUESTION,
  DAY29_QUEST_OPTIONS,
  DAY29_QUEST_COMPLETION_MESSAGE,
  day29AssetUrl,
} from "@/lib/day29/comicContent";
import { buildPlaybackPlan } from "@/lib/day29/audioSequencer";

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

export default function Day29Page() {
  const [currentPage, setCurrentPage] = useState(1);
  const [soundOn, setSoundOn] = useState(true);
  const [initData, setInitData] = useState<string | null>(null);
  // null = still loading the initial quest-status check.
  const [questAnswered, setQuestAnswered] = useState<boolean | null>(null);
  const [questFeedback, setQuestFeedback] = useState<"correct" | "incorrect" | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timeoutRef = useRef<number | null>(null);
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  const stopPlayback = useCallback(() => {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    const audio = audioRef.current;
    if (audio) {
      audio.onended = null;
      audio.pause();
    }
  }, []);

  const playPageSequence = useCallback((pageNumber: number) => {
    const audio = audioRef.current;
    const page = DAY29_STORY_PAGES.find((p) => p.pageNumber === pageNumber);
    if (!audio || !page) return;

    const plan = buildPlaybackPlan(page.speeches);
    let index = 0;

    const playStep = () => {
      if (index >= plan.length) return;
      const step = plan[index];
      audio.src = day29AssetUrl(step.audioFile);
      audio.play().catch(() => {
        // Autoplay can be blocked before the first user gesture inside the
        // Telegram webview — the sound toggle remains available as a manual
        // retry, so a failed autoplay here isn't fatal.
      });
      audio.onended = () => {
        index += 1;
        if (index < plan.length) {
          timeoutRef.current = window.setTimeout(playStep, step.gapAfterMs);
        }
      };
    };

    playStep();
  }, []);

  // Restart the current page's audio whenever the visible page changes or
  // sound is toggled — see file header for why one effect covers both.
  useEffect(() => {
    stopPlayback();
    if (soundOn && currentPage <= DAY29_STORY_PAGES.length) {
      playPageSequence(currentPage);
    }
    return stopPlayback;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [soundOn, currentPage]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const mostVisible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (!mostVisible) return;
        const pageNumber = Number((mostVisible.target as HTMLElement).dataset.day29Page);
        if (Number.isFinite(pageNumber) && pageNumber > 0) {
          setCurrentPage((prev) => (prev === pageNumber ? prev : pageNumber));
        }
      },
      { threshold: [0.6] },
    );
    pageRefs.current.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!initData) return;
    let cancelled = false;
    fetch(`/api/day29/quest-status?initData=${encodeURIComponent(initData)}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`status ${res.status}`))))
      .then((data: { answeredCorrectly: boolean }) => {
        if (!cancelled) setQuestAnswered(Boolean(data.answeredCorrectly));
      })
      .catch(() => {
        // Judgment call: fail open to the question rather than getting the
        // learner stuck on a permanent loading state if the check fails.
        if (!cancelled) setQuestAnswered(false);
      });
    return () => {
      cancelled = true;
    };
  }, [initData]);

  const registerPageRef = useCallback((pageNumber: number) => {
    return (el: HTMLDivElement | null) => {
      if (el) pageRefs.current.set(pageNumber, el);
      else pageRefs.current.delete(pageNumber);
    };
  }, []);

  const goToPage = (pageNumber: number) => {
    pageRefs.current.get(pageNumber)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const submitAnswer = async (answerId: string) => {
    if (!initData || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/day29/quest-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ initData, answerId }),
      });
      const data = (await res.json()) as { correct: boolean };
      if (data.correct) {
        setQuestAnswered(true);
        setQuestFeedback("correct");
      } else {
        setQuestFeedback("incorrect");
      }
    } finally {
      setSubmitting(false);
    }
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

      <button
        type="button"
        className={styles.soundToggle}
        aria-label={soundOn ? "Turn sound off" : "Turn sound on"}
        onClick={() => setSoundOn((prev) => !prev)}
      >
        {soundOn ? "🔊" : "🔇"}
      </button>

      <div className={styles.navArrows}>
        <button
          type="button"
          className={styles.navButton}
          aria-label="Previous page"
          disabled={currentPage <= 1}
          onClick={() => goToPage(currentPage - 1)}
        >
          ◀
        </button>
        <button
          type="button"
          className={styles.navButton}
          aria-label="Next page"
          disabled={currentPage >= DAY29_TOTAL_PAGES}
          onClick={() => goToPage(currentPage + 1)}
        >
          ▶
        </button>
      </div>

      <div className={styles.pageIndicator}>
        {currentPage} of {DAY29_TOTAL_PAGES}
      </div>

      <div className={styles.scroller}>
        {DAY29_STORY_PAGES.map((page) => (
          <div
            key={page.pageNumber}
            ref={registerPageRef(page.pageNumber)}
            data-day29-page={page.pageNumber}
            className={styles.page}
          >
            <img src={day29AssetUrl(page.image)} alt={`Day 29 story, page ${page.pageNumber}`} className={styles.pageImage} />
          </div>
        ))}

        <div
          ref={registerPageRef(DAY29_QUEST_PAGE_NUMBER)}
          data-day29-page={DAY29_QUEST_PAGE_NUMBER}
          className={styles.page}
        >
          {questAnswered === null ? (
            <p className={styles.loading}>Loading...</p>
          ) : questAnswered ? (
            <p className={styles.completionMessage}>{DAY29_QUEST_COMPLETION_MESSAGE}</p>
          ) : (
            <div className={styles.questCard}>
              <p className={styles.questQuestion}>{DAY29_QUEST_QUESTION}</p>
              <div className={styles.questOptions}>
                {DAY29_QUEST_OPTIONS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    className={styles.questOption}
                    disabled={submitting}
                    onClick={() => submitAnswer(option.id)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <p className={styles.questFeedback}>
                {questFeedback === "incorrect" ? "Not quite — give it another try!" : ""}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
