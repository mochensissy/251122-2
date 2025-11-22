/*
  # Add contact_email to user_profiles

  目的:
  - 支持在画像中持久保存员工的联系邮箱，便于审批通过后做邮件回传
*/

ALTER TABLE user_profiles
ADD COLUMN IF NOT EXISTS contact_email TEXT;
