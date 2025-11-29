-- Test WhatsApp notification
INSERT INTO public.notification_queue (
  event,
  channel,
  payload,
  sacco_id,
  status,
  scheduled_for
) VALUES (
  'test.whatsapp.deployment',
  'WHATSAPP',
  jsonb_build_object(
    'to', '+250788767816',
    'body', 'Test message from Ibimina SACCO notification system. Deployment successful!'
  ),
  NULL,
  'PENDING',
  NOW()
)
RETURNING id, event, channel, status, created_at;
