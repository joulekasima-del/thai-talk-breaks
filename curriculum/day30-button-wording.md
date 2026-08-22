# Day 30 Quiz — Button Wording (English Meaning)

**Design intent confirmed:** the button shown on screen displays the **English meaning**, while the audio behind it plays the **Thai phrase** (no particle, no pronoun, per the earlier confirmed adjustments). The learner hears Thai and taps the English meaning that matches — a genuine listening-comprehension test, not a text-matching one.

Nothing in the repo previously specified button wording at all (`LDTKB-026` only described "audio clips," no text label) — this is a new addition, not a fix to something already wrong.

| Audio file | Thai (spoken) | Button text (English) |
|---|---|---|
| Q1_correct_answer.mp3 | สวัสดี | Hello |
| Q1_distractor-1.mp3 | ขอโทษ | Sorry |
| Q1_distractor-2.mp3 | เจอกันใหม่ | See you again |
| Q2_correct_answer.mp3 | เท่าไหร่ | How much? |
| Q2_distractor-1.mp3 | จ่ายผ่านบัตรได้ไหม | Can I pay by card? |
| Q2_distractor-2.mp3 | จองห้องหนึ่งคืน | Book one night |
| Q3_correct_answer.mp3 | ไม่เข้าใจ | I don't understand |
| Q3_distractor-1.mp3 | ช่วยด้วย | Help! |
| Q3_distractor-2.mp3 | ขอโทษ | Sorry |
| Q4_correct_answer.mp3 | กี่โมงแล้ว | What time is it? |
| Q4_distractor-1.mp3 | พรุ่งนี้เจอกันนะ | See you tomorrow |
| Q4_distractor-2.mp3 | เจอกันใหม่ | See you again |
| Q5_correct_answer.mp3 | เอากาแฟเย็นหนึ่งแก้ว | I'll take one iced coffee |
| Q5_distractor-1.mp3 | เอาอันนี้ | I'll take this one |
| Q5_distractor-2.mp3 | อร่อยมาก | This is very delicious! |
| Q6_correct_answer.mp3 | ชอบดูหนัง | I like watching movies |
| Q6_distractor-1.mp3 | ไม่ชอบรถติด | I don't like traffic |
| Q6_distractor-2.mp3 | ชื่อต้อม | My name is Dtom |
| Q7_correct_answer.mp3 | อร่อยมาก | This is very delicious! |
| Q7_distractor-1.mp3 | วันนี้ร้อนมาก | It's very hot today |
| Q7_distractor-2.mp3 | เมืองไทยสวย | Thailand is beautiful |
| Q8_correct_answer.mp3 | ขอโทษ | Sorry |
| Q8_distractor-1.mp3 | ไม่เข้าใจ | I don't understand |
| Q8_distractor-2.mp3 | ช่วยด้วย | Help! |
| Q9_correct_answer.mp3 | ปวดหัว | I have a headache |
| Q9_distractor-1.mp3 | ปวดท้อง | I have a stomach ache |
| Q9_distractor-2.mp3 | รู้สึกตัวร้อน | I feel feverish |
| Q10_correct_answer.mp3 | ขอบคุณมาก | Thank you very much |
| Q10_distractor-1.mp3 | สวัสดี | Hello |
| Q10_distractor-2.mp3 | ขอโทษ | Sorry |

## One thing worth flagging before this is locked in

On **Q1, Q8, Q10** and **Q3/Q8**, the *same* English button text ("Sorry" appears in 3 different questions; "Hello" in 2; "I don't understand" in 2; "See you again" in 2) shows up more than once — but never twice **within the same question**, so no single question ever has two identical-looking buttons. That's fine and doesn't create ambiguity for the learner. Flagging only so it's a confirmed observation, not an overlooked bug.
