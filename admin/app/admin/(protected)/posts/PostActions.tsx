'use client';

import { useState } from 'react';

type Props = {
  postId: string;
  status: string;
  deleted: boolean;
  views: number;
  likes: number;
  comments: number;
};

export default function PostActions(props: Props) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function moderate(action: 'approve' | 'flag' | 'soft_delete' | 'restore') {
    const reason = window.prompt('Reason (minimum 8 characters)');
    if (!reason) return;
    setBusy(true);
    const response = await fetch(`/api/admin/v1/posts/${props.postId}/moderate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'idempotency-key': crypto.randomUUID() },
      body: JSON.stringify({ action, reason }),
    });
    const result = await response.json() as { error?: string };
    setBusy(false);
    setMessage(response.ok ? 'Post updated. Refreshing…' : result.error ?? 'Update failed.');
    if (response.ok) window.location.reload();
  }

  async function setMetrics(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const form = new FormData(event.currentTarget);
    const response = await fetch(`/api/admin/v1/posts/${props.postId}/metrics`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'idempotency-key': crypto.randomUUID() },
      body: JSON.stringify({
        viewsCount: Number(form.get('views')),
        likesCount: Number(form.get('likes')),
        commentsCount: Number(form.get('comments')),
        reason: form.get('reason'),
      }),
    });
    const result = await response.json() as { error?: string; code?: string };
    if (response.status === 409 && result.code === 'approval_required') {
      const approvalResponse = await fetch('/api/admin/v1/approvals', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'idempotency-key': crypto.randomUUID() },
        body: JSON.stringify({
          action: 'post_metrics_set',
          resourceType: 'post',
          resourceId: props.postId,
          reason: form.get('reason'),
          payload: {
            viewsCount: Number(form.get('views')),
            likesCount: Number(form.get('likes')),
            commentsCount: Number(form.get('comments')),
          },
        }),
      });
      const approvalResult = await approvalResponse.json() as { error?: string };
      setBusy(false);
      setMessage(
        approvalResponse.ok
          ? 'Large change sent for independent approval.'
          : approvalResult.error ?? 'Approval request failed.',
      );
      return;
    }
    setBusy(false);
    setMessage(response.ok ? 'Metrics updated. Refreshing…' : result.error ?? 'Update failed.');
    if (response.ok) window.location.reload();
  }

  return (
    <div className="postActions">
      <button type="button" className="secondaryButton" onClick={() => setOpen(value => !value)} aria-expanded={open}>Manage</button>
      {open ? (
        <div className="popoverPanel">
          <div className="buttonRow">
            {props.deleted
              ? <button disabled={busy} onClick={() => moderate('restore')}>Restore</button>
              : <>
                  {props.status !== 'active' ? <button disabled={busy} onClick={() => moderate('approve')}>Approve</button> : null}
                  <button disabled={busy} className="secondaryButton" onClick={() => moderate('flag')}>Flag</button>
                  <button disabled={busy} className="dangerButton" onClick={() => moderate('soft_delete')}>Move to trash</button>
                </>}
          </div>
          <form className="metricForm" onSubmit={setMetrics}>
            <label>Views<input name="views" type="number" min={0} step={1} defaultValue={props.views} required /></label>
            <label>Likes<input name="likes" type="number" min={0} step={1} defaultValue={props.likes} required /></label>
            <label>Comments<input name="comments" type="number" min={0} step={1} defaultValue={props.comments} required /></label>
            <label className="wide">Reason<input name="reason" minLength={8} maxLength={1000} required /></label>
            <button disabled={busy}>Set raw counters</button>
          </form>
          {message ? <p className="formMessage" role="status">{message}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
