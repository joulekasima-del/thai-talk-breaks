-- Fix: lesson_deliveries.lesson_number constraint was left at 1-7 (pilot-only)
-- after Checkpoint 5 extended delivery to Days 8-28. Corrected to 1-29 per
-- Joule's confirmation — Day 29's entry-message delivery also uses this table
-- (lesson_number = 29) rather than a separate tracking mechanism.
alter table lesson_deliveries drop constraint lesson_deliveries_lesson_number_check;
alter table lesson_deliveries add constraint lesson_deliveries_lesson_number_check
  check (lesson_number between 1 and 29);
