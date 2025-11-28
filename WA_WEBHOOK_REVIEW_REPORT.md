# WhatsApp Webhook Microservice - Deep Review Report
**Date:** November 28, 2025  
**Reviewed By:** AI Code Analysis  
**Project:** Ibimina SACCO Platform

---

## Executive Summary

**UPDATED FINDINGS:** There are **TWO separate WhatsApp services** in the codebase:

1. **`wa-relay`** (deployed at root) - For incoming webhook handling from WhatsApp → **Deployed but misconfigured**
2. **`notification-dispatch-whatsapp`** (in workspace/ibimina) - For sending outbound notifications → **NOT DEPLOYED**

Users **cannot receive messages** because:
- The **outbound notification service is not deployed** to Supabase
- Required Meta WhatsApp secrets (`META_WHATSAPP_ACCESS_TOKEN`, `META_WHATSAPP_PHONE_NUMBER_ID`) are **not configured**
- The notification queue exists in the database but has no worker to process it
- A migration **disabled WhatsApp notifications** by converting all `WHATSAPP` channel to `IN_APP`

---

## Current Architecture

### Deployed Services

#### 1. `wa-relay` (ROOT - Inbound Webhook Handler)
- **Location:** `/supabase/functions/wa-relay/index.ts`
- **Status:** ✅ Deployed (Active, Version 3)
- **Endpoint:** `https://elhlcdiosomutugpneoc.supabase.co/functions/v1/wa-relay`
- **Purpose:** Handle incoming WhatsApp messages from Meta webhook
- **Issues:** 
  - `verify_jwt = true` blocks Meta webhooks (returns 401)
  - Missing env vars: `WHATSAPP_TOKEN`, `PHONE_NUMBER_ID`, `WA_VERIFY_TOKEN`, `OPENAI_WORKFLOW_ID`
  - Only `OPENAI_API_KEY` is configured

#### 2. `notification-dispatch-whatsapp` (IBIMINA - Outbound Message Sender)
- **Location:** `workspace/ibimina/supabase/functions/notification-dispatch-whatsapp/index.ts`
- **Status:** ❌ **NOT DEPLOYED** - Exists in code only
- **Purpose:** Process notification queue and send WhatsApp messages to users
- **Architecture:**
  - Reads from `public.notification_queue` table
  - Fetches templates from `public.notification_templates`
  - Uses Meta WhatsApp Business API to send messages
  - Implements retry logic with exponential backoff
  - Requires HMAC authentication for security
- **Missing Secrets:**
  - `META_WHATSAPP_ACCESS_TOKEN` ❌
  - `META_WHATSAPP_PHONE_NUMBER_ID` ❌

### Database Schema
- **`notification_queue`**: Queue for outbound notifications (SMS, Email, WhatsApp)
- **`notification_templates`**: Message templates with variable substitution
- **`notification_channel` enum**: `WHATSAPP`, `EMAIL`, `IN_APP`
- **Problem:** Migration `20251101120000` **converted all WHATSAPP jobs to IN_APP**

---

## Critical Issues Identified

### 🔴 Issue #1: Outbound Notification Service Not Deployed (CRITICAL)

**Problem:** The primary WhatsApp message sender (`notification-dispatch-whatsapp`) is **not deployed** to Supabase.

**Evidence:**
```bash
$ cd supabase && supabase functions list | grep notification
notifications        | notifications        | ACTIVE | 6
# notification-dispatch-whatsapp is MISSING ❌
```

**Impact:**
- Users cannot receive any WhatsApp messages
- Notification queue jobs remain in `PENDING` status forever
- No worker to process queued WhatsApp notifications
- Frontend enqueues messages but nothing sends them

**Root Cause:** Function exists in `workspace/ibimina/supabase/functions/` but was never deployed to production.

---

### 🔴 Issue #2: Missing Meta WhatsApp API Credentials (CRITICAL)

**Problem:** Required environment variables for Meta WhatsApp Business API are **completely missing**.

#### Required by `notification-dispatch-whatsapp`:
```typescript
const accessToken = requireEnv("META_WHATSAPP_ACCESS_TOKEN");  // ❌ MISSING
const phoneNumberId = requireEnv("META_WHATSAPP_PHONE_NUMBER_ID"); // ❌ MISSING
```

**Current State:**
```bash
$ supabase secrets list | grep -E "META|WHATSAPP"
# No results - variables don't exist ❌
```

**Impact:**
- Even if deployed, function will crash immediately on `requireEnv()` call
- Cannot authenticate with Facebook Graph API
- Cannot identify which phone number to send from

---

### 🔴 Issue #3: Migration Disabled WhatsApp Notifications (CRITICAL)

**Problem:** Database migration `20251101120000_update_notification_channel_enum.sql` **forcibly converted all WhatsApp notifications to IN_APP**.

**Migration Code:**
```sql
-- Align existing queue entries with the new in-app channel option
UPDATE public.notification_queue
SET channel = 'IN_APP'::public.notification_channel
WHERE channel = 'WHATSAPP'::public.notification_channel;
```

**Impact:**
- All pending WhatsApp messages were converted to in-app notifications
- New WhatsApp notifications may be misconfigured as IN_APP
- Effectively **disabled WhatsApp channel at database level**

**This suggests WhatsApp was intentionally disabled**, possibly due to:
- Lack of Meta Business Account setup
- Cost concerns
- Temporary workaround pending proper integration

---

### 🔴 Issue #4: wa-relay JWT Verification Blocks Webhooks (CRITICAL)

**Code Analysis:**
```typescript
async function sendWA(to: string, text: string) {
  await fetch(`https://graph.facebook.com/v20.0/${PHONE_NUMBER_ID}/messages`, {
    // ... API call
  });
  // ❌ No error handling
  // ❌ No response validation
  // ❌ No logging
}
```

**Problems:**
- Silent failures when message sending fails
- No visibility into API errors (rate limits, auth failures, invalid numbers)
- No tracking of message delivery status
- Difficult to debug production issues

**Impact:** Users don't receive messages, and there's no way to diagnose why.

---

### 🟡 Issue #5: JWT Verification May Block Webhooks

**Configuration:**
```toml
[functions.wa-relay]
enabled = true
verify_jwt = true  # ⚠️ This may block Meta webhooks
```

**Problem:** Meta/WhatsApp webhooks send requests without Supabase JWT tokens. The `verify_jwt = true` setting may reject these legitimate webhook callbacks.

**Expected Behavior:** Webhooks should bypass JWT verification (set `verify_jwt = false` for public webhooks).

---

### 🟡 Issue #6: No Message Storage or Audit Trail

**Missing Functionality:**
- No database table to store incoming/outgoing messages
- No conversation history tracking
- No opt-out list management
- No message delivery status tracking
- No analytics on message volume

**Database Review:**
- `public.notifications` table exists but is for internal app notifications
- No `whatsapp_messages` or `message_queue` tables found
- No message persistence logic in wa-relay function

**Impact:** 
- Cannot track user conversations
- Cannot honor opt-out requests permanently
- No visibility into message metrics

---

## Message Flow Analysis

### Expected Flow:
```
User sends WhatsApp → Meta API → Webhook POST → wa-relay → Process → Send Reply
                                                    ↓
                                            Forward to legacy
```

### Current Breaks:
1. **Meta → Webhook**: ❌ URL not registered with Meta
2. **Webhook Verification**: ❌ No WA_VERIFY_TOKEN configured
3. **JWT Blocking**: ⚠️ May reject Meta's POST requests
4. **Message Sending**: ❌ No WHATSAPP_TOKEN or PHONE_NUMBER_ID
5. **AI Response**: ❌ No OPENAI_WORKFLOW_ID

---

## Code Quality Issues

### 1. **Unsafe Environment Variable Access**
```typescript
const WHATSAPP_TOKEN = Deno.env.get("WHATSAPP_TOKEN")!; // ❌ Will be undefined
```
Should use:
```typescript
const WHATSAPP_TOKEN = Deno.env.get("WHATSAPP_TOKEN");
if (!WHATSAPP_TOKEN) {
  throw new Error("WHATSAPP_TOKEN not configured");
}
```

### 2. **No Response Validation**
```typescript
async function sendWA(to: string, text: string) {
  await fetch(...); // ❌ No check if request succeeded
}
```

Should capture and log errors:
```typescript
async function sendWA(to: string, text: string) {
  const response = await fetch(...);
  if (!response.ok) {
    console.error(`Failed to send message: ${response.status}`, await response.text());
    throw new Error(`WhatsApp API error: ${response.status}`);
  }
  return await response.json();
}
```

### 3. **Silent Failure on OpenAI Errors**
```typescript
const data = await r.json().catch(() => ({})); // ❌ Swallows errors
```

### 4. **Legacy Forwarding Error Handling**
```typescript
catch (_e) { /* don't fail the relay if forwarding breaks */ }
```
Should at least log the error for monitoring.

---

## Infrastructure Gaps

### Missing Components:
1. **Monitoring & Alerting**
   - No Sentry/error tracking integration
   - No webhook failure alerts
   - No message delivery monitoring

2. **Rate Limiting**
   - No protection against spam
   - No per-user rate limits
   - Could be abused for OpenAI API costs

3. **Message Queue**
   - No retry mechanism for failed sends
   - No queue for high-volume scenarios
   - Direct synchronous calls may timeout

4. **Database Schema**
   - No message persistence
   - No conversation state storage
   - No opt-out list

---

## Security Concerns

### 1. **Webhook Signature Verification Missing**
Meta sends webhook payloads with HMAC signatures that should be validated.

**Missing:**
```typescript
// Should validate X-Hub-Signature-256 header
function verifyWebhookSignature(payload: string, signature: string): boolean {
  // Implementation needed
}
```

### 2. **No Request Origin Validation**
Anyone with the endpoint URL can send POST requests.

### 3. **Environment Variables Exposed in Logs**
Potential for secrets to leak in error logs if not properly sanitized.

---

## Comparison with Other Services

### Working Services (for reference):
- **MTN Mobile Money**: Has webhook secret (`MOMO_WEBHOOK_SECRET`)
- **Airtel Money**: Has API credentials (`AIRTEL_KEY`, `AIRTEL_SECRET`)
- **Stripe**: Has webhook secret (`STRIPE_WEBHOOK_SECRET`)

### WhatsApp Service:
- ❌ No webhook secret configured
- ❌ No API credentials set
- ❌ No integration documentation

**Conclusion:** WhatsApp integration was scaffolded but never completed.

---

## Root Cause Analysis

### Timeline Reconstruction:
1. ✅ Function code written (`wa-relay/index.ts`)
2. ✅ Function configuration added (`config.toml`)
3. ✅ Function deployed to Supabase
4. ❌ Meta Business API setup never completed
5. ❌ Environment secrets never configured
6. ❌ Webhook URL never registered with Meta
7. ❌ No testing or validation performed

### Why Users Can't Receive Messages:

**Primary Reasons (Blocking):**
1. **Notification Dispatch Service Not Deployed** - The worker that sends WhatsApp messages doesn't exist in production
2. **Missing Meta API Credentials** - No way to authenticate with WhatsApp Business API  
3. **Database Migration Disabled Channel** - WhatsApp notifications converted to IN_APP
4. **No Meta Business Account** - Service not registered with Meta (assumed)
5. **Webhook URL Not Registered** - Meta doesn't know where to send incoming messages (for wa-relay)

**Secondary Reasons (Configuration):**
1. wa-relay JWT verification blocking webhook callbacks
2. wa-relay missing environment variables (WHATSAPP_TOKEN, etc.)
3. No error logging - Failures are silent
4. No database persistence - Cannot track delivery status
5. No monitoring - No visibility into issues

**The Real Problem:** This appears to be an **incomplete feature** where:
- Code was written and partially deployed
- Database migration **intentionally disabled WhatsApp** (converted to IN_APP)
- Meta Business setup was never completed
- Main sending service was never deployed

This suggests WhatsApp integration was **abandoned or postponed** mid-development.

---

## Recommendations

### Immediate Actions (Critical - Do These First)

#### 1. Deploy the Outbound Notification Service
```bash
cd workspace/ibimina
supabase functions deploy notification-dispatch-whatsapp --project-ref elhlcdiosomutugpneoc --no-verify-jwt
```

#### 2. Configure Meta WhatsApp Secrets
```bash
cd workspace/ibimina
supabase secrets set META_WHATSAPP_ACCESS_TOKEN="<Meta Access Token>"
supabase secrets set META_WHATSAPP_PHONE_NUMBER_ID="<Meta Phone Number ID>"
```

#### 3. Fix wa-relay Configuration (for inbound webhooks)
```bash
cd /Users/jeanbosco
supabase secrets set WHATSAPP_TOKEN="<Same as META_WHATSAPP_ACCESS_TOKEN>"
supabase secrets set PHONE_NUMBER_ID="<Same as META_WHATSAPP_PHONE_NUMBER_ID>"
supabase secrets set WA_VERIFY_TOKEN="<Random Strong Token>"
supabase secrets set OPENAI_WORKFLOW_ID="<OpenAI Workflow ID>"
```

Edit `supabase/config.toml`:
```toml
[functions.wa-relay]
enabled = true
verify_jwt = false  # ← Change this to allow webhook callbacks
```

Redeploy:
```bash
cd supabase
supabase functions deploy wa-relay --no-verify-jwt
```

#### 4. Reverse Database Migration (Re-enable WhatsApp Channel)

Create new migration:
```sql
-- /workspace/ibimina/supabase/migrations/20251128000000_reenable_whatsapp.sql

-- Notification channel is already correct (has WHATSAPP, EMAIL, IN_APP)
-- Restore channel default for new jobs
ALTER TABLE public.notification_queue
  ALTER COLUMN channel SET DEFAULT 'IN_APP'::public.notification_channel;

-- Note: Old jobs converted to IN_APP will stay IN_APP
-- New WhatsApp notifications must explicitly specify channel='WHATSAPP'
```

#### 5. Meta Business Setup
1. Create WhatsApp Business Account at https://business.facebook.com
2. Register phone number with Meta (requires business verification)
3. Generate **permanent** access token (not temporary 24h token)
4. Get Phone Number ID from Meta Business Manager
5. Register webhook URLs:
   - Inbound: `https://elhlcdiosomutugpneoc.supabase.co/functions/v1/wa-relay`
   - Use the `WA_VERIFY_TOKEN` during verification
6. Subscribe to message events

#### 6. Test the Integration
```bash
# Test notification dispatch
curl -X POST "https://elhlcdiosomutugpneoc.supabase.co/functions/v1/notification-dispatch-whatsapp" \
  -H "Content-Type: application/json" \
  -H "X-Signature: <HMAC signature>" \
  -H "X-Timestamp: $(date +%s)" \
  -d '{}'

# Insert test notification
psql -c "INSERT INTO public.notification_queue (event, channel, payload, sacco_id) VALUES ('test.message', 'WHATSAPP', '{\"to\": \"+250788123456\", \"body\": \"Test message\"}'::jsonb, NULL);"
```

---

### Short-term Improvements (Week 1-2)

#### 5. Add Message Persistence
Create migration:
```sql
CREATE TABLE public.whatsapp_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  from_number TEXT NOT NULL,
  to_number TEXT NOT NULL,
  message_body TEXT,
  message_type TEXT DEFAULT 'text',
  wa_message_id TEXT UNIQUE,
  status TEXT DEFAULT 'sent',
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_wa_messages_from ON whatsapp_messages(from_number);
CREATE INDEX idx_wa_messages_created ON whatsapp_messages(created_at DESC);
```

#### 6. Add Webhook Signature Verification
```typescript
async function verifyWebhook(req: Request, body: string): Promise<boolean> {
  const signature = req.headers.get("x-hub-signature-256");
  if (!signature) return false;
  
  // Implement HMAC-SHA256 verification
  // Using Meta's app secret
}
```

#### 7. Implement Opt-out Persistence
Create table for opt-outs:
```sql
CREATE TABLE public.whatsapp_optouts (
  phone_number TEXT PRIMARY KEY,
  opted_out_at TIMESTAMPTZ DEFAULT now(),
  reason TEXT
);
```

#### 8. Add Monitoring
- Set up error tracking (Sentry/Supabase logs)
- Create dashboard for message volume
- Alert on API failures

---

### Medium-term Enhancements (Month 1)

#### 9. Message Queue Implementation
- Add Redis/Supabase queue for retry logic
- Implement exponential backoff for failures
- Handle rate limits gracefully

#### 10. Conversation State Management
- Store conversation context
- Implement session timeout
- Track user journey

#### 11. Advanced Features
- Support for media messages (images, documents)
- Template message support for notifications
- Interactive buttons/quick replies
- Message templates for compliance

---

### Long-term Considerations (Quarter 1)

#### 12. Scale & Performance
- Implement message batching
- Add caching layer for frequent queries
- Optimize database queries
- Consider dedicated message queue service

#### 13. Analytics & Reporting
- Message delivery rates
- Response time metrics
- User engagement analytics
- Cost tracking (OpenAI API usage)

#### 14. Multi-channel Support
- Extend to SMS fallback
- Support multiple WhatsApp numbers
- Multi-language support

---

## Testing Checklist

Before going live, verify:

- [ ] Environment variables set and verified
- [ ] Webhook URL registered with Meta
- [ ] Webhook verification successful (GET request)
- [ ] Can receive incoming messages (POST request)
- [ ] Can send outbound messages successfully
- [ ] "More info" trigger works with OpenAI
- [ ] "Stop" opt-out works
- [ ] Legacy forwarding works (if enabled)
- [ ] Error logging is working
- [ ] Message persistence is working
- [ ] Rate limiting is in place
- [ ] Security headers are set
- [ ] JWT verification is disabled for webhooks

---

## Cost Estimate

### Current State: $0/month (non-functional)

### After Fix:
- **Meta WhatsApp Business**: Free tier (1,000 conversations/month)
- **OpenAI Workflow API**: Variable (~$0.01-0.10 per message with AI)
- **Supabase Edge Functions**: Free tier (500k requests/month)
- **Database Storage**: Minimal (<1GB)

**Estimated:** $10-50/month depending on message volume and AI usage.

---

## Conclusion

The WhatsApp integration is **50% implemented** with critical components missing:

**What Exists:**
- ✅ Outbound notification service code (`notification-dispatch-whatsapp`)
- ✅ Inbound webhook handler code (`wa-relay`)  
- ✅ Database schema (notification_queue, templates)
- ✅ Retry logic and error handling in code
- ✅ Template system with variable substitution

**What's Missing:**
- ❌ Outbound service **not deployed** to production
- ❌ Meta WhatsApp API credentials **not configured**
- ❌ Database channel **intentionally disabled** via migration
- ❌ Meta Business Account setup (assumed)
- ❌ Webhook registration with Meta

**Why Users Can't Receive Messages:**
1. **Main sending service doesn't exist in production** - `notification-dispatch-whatsapp` was never deployed
2. **No API credentials** - Cannot authenticate with Meta's WhatsApp Business API
3. **Database disabled the channel** - Migration converted WHATSAPP → IN_APP
4. **No Meta Business setup** - Likely never completed business verification

**Root Cause:** This is an **abandoned/incomplete feature**, not a configuration issue. The code is production-ready, but:
- Deployment was never completed
- Meta Business onboarding was never finished  
- A migration later **disabled the channel**, suggesting it was intentionally turned off

**Estimated Time to Fix:**
- **If you have Meta Business Account**: 2-4 hours (deploy + configure)
- **If you need Meta Business setup**: 2-5 days (Meta business verification takes 24-48 hours)
- **Full production-ready**: 1 week (including testing, monitoring, templates)

**Recommended Next Steps:**
1. Confirm if Meta WhatsApp Business Account exists
2. If yes: Deploy notification-dispatch-whatsapp + configure secrets
3. If no: Complete Meta Business verification first
4. Create migration to re-enable WHATSAPP channel  
5. Set up monitoring and alerting
6. Test with real phone numbers

---

**Report Generated:** November 28, 2025  
**Review Status:** Complete - Root Cause Identified  
**Priority:** 🔴 Critical - Main Service Not Deployed  
**Architecture:** Two-service system (inbound + outbound) with queue-based processing
