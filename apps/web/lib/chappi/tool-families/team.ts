// Team tools (SERVER-ONLY). The read is what lets the assistant turn "assign
// it to Ada" into a real user id instead of guessing one, which the task PATCH
// route would reject anyway.
//
// Both writes are confirmation-gated, for different reasons: inviting reaches
// a real person (by email when delivery is configured, otherwise as a link the
// user then sends) and cannot be taken back, and removing someone takes their
// access away immediately. Neither is a delete, which is why the gate keys off
// the `confirm` builder rather than a "destructive" classification.

import { isEmailConfigured } from '@/lib/email';
import { apiError, argString, callInternalApi, fail, type ChappiTool } from './shared';

export const TEAM_TOOLS: ChappiTool[] = [
  {
    name: 'list_workspace_members',
    kind: 'read',
    description:
      'List the teammates on your team with their user ids. Use this to resolve a person\'s name to the assigneeId that create_task and update_task need.',
    inputSchema: { type: 'object', properties: {} },
    execute: async (ctx) => {
      const res = await callInternalApi(ctx, '/api/workspace/members', { method: 'GET' });
      if (!res.ok) return fail(apiError(res, 'Could not load your teammates.'));

      const members = Array.isArray(res.body.members)
        ? (res.body.members as Record<string, unknown>[])
        : [];
      const data = members.map((member) => ({
        // userId is null for someone invited who has not joined yet — they
        // cannot be assigned work, and saying so keeps the model from trying.
        userId: (member.userId ?? null) as string | null,
        name: String(member.name ?? member.email ?? 'Teammate'),
        email: String(member.email ?? ''),
        role: String(member.role ?? ''),
        status: String(member.status ?? ''),
      }));
      const assignable = data.filter((m) => m.userId).length;
      return {
        ok: true,
        summary: `${data.length} teammate(s), ${assignable} assignable.`,
        data,
      };
    },
  },
  {
    name: 'invite_teammate',
    kind: 'mutate',
    description:
      'Invite someone to your team by email. Requires the user to approve a confirmation card — calling this only proposes it, and the invite email is not sent until they approve.',
    inputSchema: {
      type: 'object',
      properties: {
        email: { type: 'string' },
        role: {
          type: 'string',
          enum: ['admin', 'member', 'guest'],
          description: 'Defaults to member. Guests get read-only access.',
        },
      },
      required: ['email'],
    },
    confirm: async (_ctx, args) => {
      const email = argString(args, 'email');
      if (!email) return { ok: false, summary: 'An email address is required.' };
      // Cheap sanity check so an obvious typo is caught before a card is shown
      // rather than after the route rejects it.
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return { ok: false, summary: `"${email}" does not look like an email address.` };
      }
      const role = argString(args, 'role') || 'member';
      const access = role === 'guest' ? 'read-only access' : `${role} access`;
      // Only promise an email when this deployment can actually send one.
      // Before transactional email was wired this card claimed "they will get
      // an email" unconditionally while the route only logged the link to the
      // server — a manager would believe someone had been contacted when
      // nobody had. The copy now tracks the real capability.
      const canEmail = isEmailConfigured();
      return {
        ok: true,
        title: `Invite ${email} to your team?`,
        detail: canEmail
          ? `They will get an email with a join link, and ${access} once they accept.`
          : `This creates a single-use join link for you to send them — email delivery is not set up, so nothing is sent automatically. They get ${access} once they accept.`,
        confirmLabel: canEmail ? 'Send invite' : 'Create invite link',
      };
    },
    execute: async (ctx, args) => {
      const email = argString(args, 'email');
      if (!email) return fail('An email address is required.');
      const res = await callInternalApi(ctx, '/api/workspace/members/invite', {
        method: 'POST',
        body: { email, role: argString(args, 'role') || undefined },
      });
      if (!res.ok) return fail(apiError(res, 'Could not send the invite.'));
      // Report the delivery outcome, not the intent — the send can fail
      // (provider outage, unverified sender) long after the card was shown,
      // and the link is the fallback in that case.
      const payload = res.body as { inviteUrl?: string | null; emailSent?: boolean };
      if (payload.emailSent) {
        return { ok: true, summary: `Invited ${email} — the invite email is on its way.` };
      }
      return {
        ok: true,
        summary: payload.inviteUrl
          ? `Created an invite for ${email}. Nothing was emailed, so send them this link: ${payload.inviteUrl}`
          : `Invited ${email}.`,
      };
    },
  },
  {
    name: 'remove_teammate',
    kind: 'mutate',
    description:
      'Remove someone from your team. Requires the user to approve a confirmation card — calling this only proposes it. The team owner cannot be removed.',
    inputSchema: {
      type: 'object',
      properties: {
        memberId: {
          type: 'string',
          description: 'The membership id from list_workspace_members — not the user id.',
        },
      },
      required: ['memberId'],
    },
    confirm: async (ctx, args) => {
      const memberId = argString(args, 'memberId');
      if (!memberId) return { ok: false, summary: 'memberId is required.' };

      const res = await callInternalApi(ctx, '/api/workspace/members', { method: 'GET' });
      if (!res.ok) return { ok: false, summary: apiError(res, 'Could not load your teammates.') };
      const members = Array.isArray(res.body.members)
        ? (res.body.members as Record<string, unknown>[])
        : [];
      const member = members.find((entry) => String(entry.id ?? '') === memberId);
      if (!member) return { ok: false, summary: 'That teammate was not found.' };
      if (member.role === 'owner') {
        return { ok: false, summary: 'The team owner cannot be removed.' };
      }

      const label = String(member.name || member.email || 'this teammate');
      return {
        ok: true,
        title: `Remove ${label} from your team?`,
        detail:
          'They lose access straight away. Anything assigned to them stays on the rollout, unassigned.',
        confirmLabel: 'Remove teammate',
      };
    },
    execute: async (ctx, args) => {
      const memberId = argString(args, 'memberId');
      if (!memberId) return fail('memberId is required.');
      const res = await callInternalApi(ctx, `/api/workspace/members/${memberId}`, {
        method: 'DELETE',
      });
      if (!res.ok) return fail(apiError(res, 'Could not remove that teammate.'));
      return { ok: true, summary: 'Removed them from your team.', clientAction: { type: 'refresh' } };
    },
  },
];
