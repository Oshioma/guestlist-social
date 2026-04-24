import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

export const dynamic = "force-dynamic";

// POST /api/interaction/suggest-reply
//
// Body: {
//   commentText: string,        // the comment we're replying to
//   commentAuthor?: string,     // e.g. @someone (display only)
//   postCaption?: string,       // parent-post caption for context
//   accountName?: string,       // operator's business name (tone anchor)
//   previous?: string,          // prior draft, if operator is regenerating
// }
// Returns { ok: true, reply: string }
//
// Picks Haiku (cheap + fast). Stores no history — the page persists the
// chosen reply itself once the operator approves.

type Body = {
  commentText?: string;
  commentAuthor?: string;
  postCaption?: string;
  accountName?: string;
  previous?: string;
};

export async function POST(req: Request) {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        {
          ok: false,
          error: "ANTHROPIC_API_KEY not set on the server.",
        },
        { status: 500 }
      );
    }

    const body = (await req.json().catch(() => ({}))) as Body;
    const comment = String(body.commentText ?? "").trim();
    if (!comment) {
      return NextResponse.json(
        { ok: false, error: "commentText is required" },
        { status: 400 }
      );
    }
    const author = String(body.commentAuthor ?? "").trim();
    const caption = String(body.postCaption ?? "").trim();
    const accountName = String(body.accountName ?? "").trim();
    const previous = String(body.previous ?? "").trim();

    const prompt = [
      `You are writing a reply from a social media brand account${
        accountName ? ` (${accountName})` : ""
      } to a comment that was left on one of their Instagram posts.`,
      "",
      caption
        ? `THE POST they commented on (caption):\n"${caption.slice(0, 600)}"`
        : null,
      "",
      `THE COMMENT${author ? ` (from ${author})` : ""}:\n"${comment.slice(0, 600)}"`,
      "",
      previous
        ? `Previous draft we rejected:\n"${previous.slice(0, 400)}"\nTry a different angle.`
        : null,
      "",
      "Write a single reply that:",
      "- Is short: one or two sentences, max ~220 characters",
      "- Sounds human, warm, specific — never generic 'thanks so much!' filler",
      "- References something concrete from the comment where possible",
      "- Uses zero hashtags, zero emoji unless the comment used them first",
      "- Does not start with an introduction or a greeting",
      "",
      "Return ONLY the reply text. No quotes, no prefix, no explanation.",
    ]
      .filter((x) => x !== null)
      .join("\n");

    const anthropic = new Anthropic({ apiKey });
    const message = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 400,
      messages: [{ role: "user", content: prompt }],
    });

    const reply = message.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text)
      .join("")
      .trim()
      // Strip matched wrapping quotes if the model ignored the
      // "no quotes" instruction. [\s\S] keeps the match cross-newline
      // without needing the `s` flag (which needs an ES2018 target
      // some of our build configs don't have).
      .replace(/^["'“”‘’]([\s\S]*)["'“”‘’]$/, "$1")
      .trim();

    if (!reply) {
      return NextResponse.json(
        { ok: false, error: "Model returned an empty reply." },
        { status: 502 }
      );
    }
    return NextResponse.json({ ok: true, reply });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
