// Supabase Edge Function: Script Revision Engine
// Handles AI-powered teleprompter script revision + chat
// Deno runtime — uses Anthropic Claude via fetch

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY') || '';

const SYSTEM_PROMPT = `You are a teleprompter script revision engine for Patrick Pychynski, founder of Stacking Capital — a business credit advisory firm for established business owners.

## YOUR ROLE
Take an existing teleprompter script and user feedback, then produce an improved version. You are NOT having a conversation — you are producing a revised script ready for the teleprompter.

## STYLE RULES (NEVER BREAK THESE)
- Conversational, direct, peer-to-peer (talking to a fellow established business owner, not a student)
- Confident but NOT salesy. Never hype. Never "guru energy."
- Use "..." for pauses/beats (Patrick's preferred pacing marker)
- ALL CAPS for emphasis words the speaker should punch
- Short paragraphs (2-4 lines max) for easy reading on teleprompter
- Include [HOOK], [CREDIBILITY], [SECTION], [CTA] markers for camera/energy shifts
- Every word earns its place — every second counts on camera
- NO "plastic" — say "credit cards"
- NO overly clever language — keep it SIMPLE and DIRECT

## BRAND FACTS (use naturally)
- 400+ clients served, $20M+ in capital accessed
- 6-month, 1-on-1 advisory program
- $100K minimum funding guarantee — in WRITING
- NOT a course, NOT group coaching, NOT a template
- US-based capital advisors, weekly Zoom calls
- War room: entire team reviews every client file every morning at 9 AM
- Four Pillars: Lender Compliance, Business Credit Scores, Business Tradelines, Financials
- Competitors: Fund & Grow (transactional), Credit Suite (generic), Boge Group ($9.8K)

## ICP
Males 40-55, $2M+ revenue, 720+ credit, established operators. They have the stuff — they just need the PLAN.

## WHEN REVISING
1. Apply the user's specific feedback precisely
2. Maintain the same overall structure unless told to change it
3. Keep the same approximate length unless told to change it
4. Preserve any section the user says is good
5. Improve weak sections with more specific data, proof, or examples
6. Every revision should be MORE conversational, not less
7. Tighten language — cut filler words, sharpen transitions

## OUTPUT FORMAT
Return ONLY the revised teleprompter script. No explanations, no "here's what I changed" commentary.
Start directly with [HOOK] and end with the [CTA] section.`;

const CHAT_ADDON = `

## ADDITIONAL ROLE: SCRIPT CONSULTANT
When the user asks questions or wants general advice (not a full revision), respond conversationally as a script consultant. Be direct, specific, and actionable. If they ask you to revise, produce the full revised script. If they ask a question, answer it briefly.`;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

async function callClaude(system: string, messages: { role: string; content: string }[]): Promise<string> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6-20250514',
      max_tokens: 4096,
      system,
      messages,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Anthropic API error: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  return data.content[0].text;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { action } = body;

    if (action === 'revise') {
      const { script, feedback, score, video_title, revision_history } = body;

      const userMessage = `## CURRENT SCRIPT
Title: ${video_title}
${score ? `Score: ${score}/10` : ''}

${script}

## FEEDBACK
${feedback}

## TASK
Revise this teleprompter script based on the feedback above. Return ONLY the improved script, ready for teleprompter.`;

      const messages: { role: string; content: string }[] = [];
      if (revision_history) {
        for (const entry of revision_history.slice(-3)) {
          messages.push({ role: 'user', content: entry.feedback || '' });
          messages.push({ role: 'assistant', content: entry.result || '' });
        }
      }
      messages.push({ role: 'user', content: userMessage });

      const revisedScript = await callClaude(SYSTEM_PROMPT, messages);

      return new Response(
        JSON.stringify({ revised_script: revisedScript, model: 'claude-sonnet-4-6' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );

    } else if (action === 'chat') {
      const { script, message, video_title, chat_history } = body;

      const messages: { role: string; content: string }[] = [];
      if (chat_history) {
        for (const entry of chat_history.slice(-10)) {
          messages.push({ role: entry.role, content: entry.content });
        }
      }
      messages.push({
        role: 'user',
        content: `[Current script for: ${video_title}]\n\n${script}\n\n---\n\n${message}`,
      });

      const response = await callClaude(SYSTEM_PROMPT + CHAT_ADDON, messages);

      return new Response(
        JSON.stringify({ response, model: 'claude-sonnet-4-6' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );

    } else {
      return new Response(
        JSON.stringify({ error: 'Unknown action. Use "revise" or "chat".' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
