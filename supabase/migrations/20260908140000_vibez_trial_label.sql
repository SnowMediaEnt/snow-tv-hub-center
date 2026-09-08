-- The trial card now reads "Trial" with the duration underneath, so the label
-- carries only the length rather than repeating the word free.
UPDATE public.signup_links SET label = '2 days' WHERE id = 'vibez-trial';
