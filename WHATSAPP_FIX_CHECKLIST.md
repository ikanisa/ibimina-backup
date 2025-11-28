# WhatsApp Integration - Quick Fix Checklist

**Problem:** Users can't receive WhatsApp messages
**Root Cause:** Notification dispatch service not deployed + missing API credentials

---

## Pre-Flight Checks

- [ ] Confirm Meta WhatsApp Business Account exists
- [ ] Have access to Meta Business Manager
- [ ] Have permanent access token (not 24h temporary token)
- [ ] Know the Phone Number ID from Meta

---

## Critical Fixes (2-4 hours)

### Step 1: Deploy Notification Dispatch Service
```bash
cd workspace/ibimina
supabase functions deploy notification-dispatch-whatsapp \
  --project-ref elhlcdiosomutugpneoc \
  --no-verify-jwt
```

**Verify:**
```bash
supabase functions list | grep notification-dispatch-whatsapp
# Should show ACTIVE status
```

---

### Step 2: Configure Meta WhatsApp Secrets
```bash
cd workspace/ibimina
supabase secrets set META_WHATSAPP_ACCESS_TOKEN="<Your Meta Access Token>"
supabase secrets set META_WHATSAPP_PHONE_NUMBER_ID="<Your Phone Number ID>"
```

**Verify:**
```bash
supabase secrets list | grep META
# Should show:
# META_WHATSAPP_ACCESS_TOKEN | <digest>
# META_WHATSAPP_PHONE_NUMBER_ID | <digest>
```

---

### Step 3: Fix wa-relay (Inbound Webhook Handler)

**3a. Update Secrets**
```bash
cd /Users/jeanbosco
supabase secrets set WHATSAPP_TOKEN="<Same as META_WHATSAPP_ACCESS_TOKEN>"
supabase secrets set PHONE_NUMBER_ID="<Same as META_WHATSAPP_PHONE_NUMBER_ID>"
supabase secrets set WA_VERIFY_TOKEN="$(openssl rand -hex 32)"
supabase secrets set OPENAI_WORKFLOW_ID="<Your OpenAI Workflow ID or skip if not using>"
```

**3b. Update Configuration**
Edit `supabase/config.toml`:
```toml
[functions.wa-relay]
enabled = true
verify_jwt = false  # ← CHANGE THIS
import_map = "./functions/wa-relay/deno.json"
entrypoint = "./functions/wa-relay/index.ts"
```

**3c. Redeploy**
```bash
cd supabase
supabase functions deploy wa-relay --no-verify-jwt
```

---

### Step 4: Register Webhook with Meta

1. Go to Meta Business Manager → WhatsApp → Configuration
2. Click "Webhooks" → "Edit"
3. Enter Webhook URL: `https://elhlcdiosomutugpneoc.supabase.co/functions/v1/wa-relay`
4. Enter Verify Token: (use the value from `WA_VERIFY_TOKEN` secret)
5. Click "Verify and Save"
6. Subscribe to `messages` event

---

### Step 5: Test Outbound Messages

**5a. Insert Test Notification**
```sql
-- Connect to your Supabase database
INSERT INTO public.notification_queue (
  event,
  channel,
  payload,
  sacco_id,
  status,
  scheduled_for
) VALUES (
  'test.whatsapp',
  'WHATSAPP',
  jsonb_build_object(
    'to', '+250788123456',  -- Replace with your test number
    'body', 'Test WhatsApp message from Ibimina SACCO'
  ),
  NULL,
  'PENDING',
  NOW()
);
```

**5b. Trigger Dispatch Function**
```bash
# Option 1: Via API call (requires HMAC signature - complex)
# Option 2: Via Supabase Dashboard
# Go to Functions → notification-dispatch-whatsapp → Invoke
```

**5c. Check Results**
```sql
SELECT id, event, channel, status, processed_at, last_error
FROM public.notification_queue
WHERE event = 'test.whatsapp'
ORDER BY created_at DESC
LIMIT 1;

-- Status should be 'DELIVERED' if successful
-- Check last_error if status is 'FAILED'
```

---

### Step 6: Monitor Logs

**Check Function Logs:**
```bash
# In Supabase Dashboard
# Go to Functions → notification-dispatch-whatsapp → Logs
# Look for errors related to Meta API calls
```

**Common Issues:**
- `Invalid access token` → Check META_WHATSAPP_ACCESS_TOKEN
- `Invalid phone number` → Check META_WHATSAPP_PHONE_NUMBER_ID
- `Rate limit exceeded` → Meta has rate limits (check Business Manager)
- `Unsupported message type` → Ensure recipient has WhatsApp installed

---

## Post-Deployment Validation

### Test Inbound Messages (Optional)
1. Send a WhatsApp message to your business number
2. Message should appear in Supabase function logs for `wa-relay`
3. If using "More info" trigger, should get AI-generated reply

### Test Outbound Notifications
- [ ] Can send simple text messages
- [ ] Messages appear in WhatsApp within 5 seconds
- [ ] Failed messages retry automatically
- [ ] Opt-out mechanism works

### Monitor Notification Queue
```sql
-- Check pending jobs
SELECT COUNT(*), channel, status
FROM public.notification_queue
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY channel, status;

-- Should see:
-- WHATSAPP | DELIVERED | <count>
-- WHATSAPP | PENDING   | <small count>
-- WHATSAPP | FAILED    | 0 (ideally)
```

---

## Troubleshooting

### Issue: `notification-dispatch-whatsapp` not found in function list
**Solution:** Function wasn't deployed. Re-run Step 1.

### Issue: Secrets not showing up
**Solution:** Secrets are project-specific. Ensure you're in the correct project:
```bash
supabase projects list
supabase link --project-ref elhlcdiosomutugpneoc
```

### Issue: Messages stay in PENDING status
**Solution:** Function may not be running. Check:
1. Is function deployed? `supabase functions list`
2. Are secrets configured? `supabase secrets list | grep META`
3. Check function logs for errors

### Issue: Messages fail with "Invalid phone number"
**Solution:** Meta requires E.164 format: `+250788123456`
- Must include country code
- No spaces or special characters
- Must be WhatsApp-enabled number

### Issue: "Invalid signature" errors
**Solution:** notification-dispatch-whatsapp requires HMAC authentication
- For testing, temporarily disable signature check
- Or call via Supabase cron job (auto-authenticated)

---

## Next Steps (After Basic Functionality Works)

### 1. Set Up Scheduled Dispatch (Recommended)
```sql
-- Create cron job to process queue every minute
SELECT cron.schedule(
  'process-whatsapp-notifications',
  '* * * * *', -- Every minute
  $$
  SELECT net.http_post(
    url := 'https://elhlcdiosomutugpneoc.supabase.co/functions/v1/notification-dispatch-whatsapp',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
    ),
    body := '{}'::jsonb
  );
  $$
);
```

### 2. Re-enable WhatsApp Channel in Application
- Update forms/code that create notifications to use `channel = 'WHATSAPP'`
- May need to update notification preferences in member profiles

### 3. Create Message Templates
```sql
-- Example: Payment received notification
INSERT INTO public.notification_templates (
  event,
  channel,
  locale,
  subject,
  body,
  tokens
) VALUES (
  'payment.received',
  'WHATSAPP',
  'en',
  NULL,
  'Hello {{member_name}}, we received your payment of {{amount}} {{currency}}. Thank you!',
  ARRAY['member_name', 'amount', 'currency']
);
```

### 4. Add Monitoring
- Set up alerts for high failure rates
- Monitor Meta API quota usage
- Track message delivery rates

### 5. Implement Message Templates (Meta)
- Create approved message templates in Meta Business Manager
- Required for notifications outside 24-hour conversation window
- Update code to use template IDs

---

## Cost Monitoring

**Meta WhatsApp Pricing (Nov 2024):**
- First 1,000 conversations/month: **Free**
- User-initiated: Free (within 24h window)
- Business-initiated: ~$0.01-0.05 per message (varies by country)

**Monitor Usage:**
- Meta Business Manager → WhatsApp → Analytics
- Track conversation volume
- Set billing alerts

---

## Success Criteria

✅ notification-dispatch-whatsapp deployed and ACTIVE  
✅ META_WHATSAPP secrets configured  
✅ Test message sent and received  
✅ Notification queue processing (PENDING → DELIVERED)  
✅ Failed messages retrying automatically  
✅ wa-relay receiving inbound webhooks (optional)  
✅ Monitoring in place  

**When all checked:** WhatsApp integration is live! 🎉

---

**Created:** 2025-11-28  
**For:** Ibimina SACCO Platform  
**Estimated Time:** 2-4 hours (with Meta credentials ready)
