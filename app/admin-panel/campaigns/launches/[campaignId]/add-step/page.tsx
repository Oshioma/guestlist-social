"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

const stepTypes = [
  { value: "email", label: "Email" },
  { value: "sms", label: "SMS" },
  { value: "wait", label: "Wait/Delay" }
];

export default function AddStepPage({ params }: { params: { campaignId: string } }) {
  const [type, setType] = useState<string>("email");
  const [name, setName] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [smsMessage, setSmsMessage] = useState("");
  const [waitHours, setWaitHours] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const router = useRouter();

  function renderStepFields() {
    if (type === "email") {
      return (
        <>
          <label className="block mb-2 font-medium">Subject:
            <input
              type="text"
              className="block w-full border rounded px-3 py-2 mb-2"
              value={emailSubject}
              onChange={e => setEmailSubject(e.target.value)}
              required
            />
          </label>
          <label className="block mb-2 font-medium">Body:
            <textarea
              className="block w-full border rounded px-3 py-2 mb-2"
              rows={5}
              value={emailBody}
              onChange={e => setEmailBody(e.target.value)}
              required
            />
          </label>
        </>
      );
    } else if (type === "sms") {
      return (
        <>
          <label className="block mb-2 font-medium">Message:
            <textarea
              className="block w-full border rounded px-3 py-2 mb-2"
              rows={3}
              value={smsMessage}
              onChange={e => setSmsMessage(e.target.value)}
              required
            />
          </label>
        </>
      );
    } else if (type === "wait") {
      return (
        <>
          <label className="block mb-2 font-medium">Delay (in hours):
            <input
              type="number"
              min={1}
              className="block w-full border rounded px-3 py-2 mb-2"
              value={waitHours}
              onChange={e => setWaitHours(e.target.value)}
              required
            />
          </label>
        </>
      );
    }
    return null;
  }

  async function addStep(e: React.FormEvent) {
    e.preventDefault();
    setStatus("Saving...");

    let content: any = {};
    if (type === "email") {
      content = { subject: emailSubject, body: emailBody };
    } else if (type === "sms") {
      content = { message: smsMessage };
    } else if (type === "wait") {
      content = { hours: Number(waitHours) || 0 };
    }

    const res = await fetch(`/api/admin-panel/campaigns/launches/${params.campaignId}/steps`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type,
        name,
        content
      })
    });

    if (res.ok) {
      setStatus("Step added!");
      router.push(`/admin-panel/campaigns/launches/${params.campaignId}`);
    } else {
      setStatus("Failed to add step.");
    }
  }

  return (
    <main className="max-w-xl mx-auto pt-8 px-4">
      <h1 className="text-2xl font-bold mb-4">Add Step to Campaign</h1>
      <form onSubmit={addStep} className="space-y-4">
        <label className="block">
          Step Type:
          <select
            className="block w-full border rounded px-3 py-2"
            value={type}
            onChange={e => {
              setType(e.target.value);
              setEmailSubject(""); setEmailBody(""); setSmsMessage(""); setWaitHours("");
            }}
          >


