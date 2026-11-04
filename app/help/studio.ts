import type { HelpPage } from './types'

export default [
  {
    slug: 'settings',
    group: 'studio',
    title: 'Studio settings',
    summary: 'Name your studio, see your plan and find the tabs for your profile, team, projects and agent tokens.',
    where: 'Account menu (your name, bottom of the sidebar) → **Studio settings**',
    shot: { name: 'settings', alt: 'The Studio tab of Studio settings, with the studio name, the plan and the delete section.' },
    see: [
      { label: 'Header', text: 'The studio name and your role in it, for example "you are editor".' },
      { label: 'Tabs', text: '**Studio**, **Profile**, **Team**, **Projects** and **Agents & API**. Each tab has its own help page.' },
      { label: 'Studio', text: 'The **Studio name** your team sees in the project switcher and on invite links.' },
      { label: 'Plan', text: '**Free during the beta**: unlimited projects, sources, facts and team members. No payment details are collected.' },
      { label: 'Delete studio', text: 'How to remove the studio and everything in it. It is done by hand with you, because it can’t be undone.' },
    ],
    tasks: [
      {
        title: 'Rename the studio',
        steps: [
          'Open the account menu and choose **Studio settings**.',
          'Type the new name in **Studio name**.',
          'Click **Save name**; the new name shows in the project switcher right away.',
        ],
      },
      {
        title: 'Ask to delete the studio',
        steps: [
          'On the **Studio** tab, scroll to **Delete studio**.',
          'Click **Contact us to delete**; it opens an email with the studio name filled in.',
          'We remove the studio, its projects, sources and canon together with you; the audit trail is append-only, so this is never automatic.',
        ],
      },
    ],
    roles: [
      { role: 'Owner, admin', can: 'Rename the studio.' },
      { role: 'Editor, viewer', can: 'See the studio name and plan. The name field is read-only.' },
    ],
    related: ['profile', 'team', 'projects', 'agents-api', 'roles'],
    keywords: ['studio name', 'rename studio', 'plan', 'pricing', 'beta', 'delete studio', 'account'],
  },
  {
    slug: 'profile',
    group: 'studio',
    title: 'Profile',
    summary: 'Change your name, your log-in email and your password, and see your role in this studio.',
    where: 'Account menu → **Studio settings** → **Profile**',
    shot: { name: 'profile', alt: 'The Profile tab with name, email, role and the change password form.' },
    see: [
      { label: 'Your profile', text: 'Your **Name** shows next to your decisions in the audit trail. Your **Email** is how you log in.' },
      { label: 'Role in this studio', text: 'Your role badge and one line on what it lets you do.' },
      { label: 'Change password', text: '**Current password**, **New password** (at least 8 characters) and **New password again**.' },
    ],
    tasks: [
      {
        title: 'Change your name or email',
        steps: [
          'Edit **Name** or **Email**.',
          'Click **Save profile**.',
          'Use the new email the next time you log in.',
        ],
      },
      {
        title: 'Change your password',
        steps: [
          'Type your **Current password**.',
          'Type the new one in **New password** and again in **New password again**.',
          'Click **Change password**; you stay signed in on this device.',
        ],
      },
    ],
    sections: [
      {
        title: 'Good to know',
        points: [
          'Other devices stay signed in after a password change; sign-in sessions can’t be revoked from here yet.',
          'There is no password reset by email yet. If you are locked out, contact your studio owner.',
          'Your role is set on the **Team** tab by an owner or admin, not here.',
        ],
      },
    ],
    roles: [
      { role: 'Everyone', can: 'Change their own name, email and password.' },
    ],
    related: ['settings', 'team', 'roles'],
    keywords: ['name', 'email', 'password', 'log in', 'account', 'my role'],
  },
  {
    slug: 'team',
    group: 'studio',
    title: 'Team',
    summary: 'See who is in the studio, change roles, and invite people with single-use links.',
    where: 'Sidebar → **Team**, or the account menu → **Invite teammates**',
    shot: { name: 'team', alt: 'The Team tab with the invite form, the members table and the list of roles.' },
    see: [
      { label: 'Invite people', text: 'Pick a **Role** and when the link expires (**Link expires**: 1, 7 or 30 days), then create a link. Owners and admins only.' },
      { label: 'Members', text: 'Everyone in the studio with their role and when they joined. Owners and admins change roles here.' },
      { label: 'Open invite links', text: 'Links that nobody has used yet, with role, creator and expiry. Copy or revoke each one.' },
      { label: 'What each role can do', text: 'One line per role: owner, admin, editor, viewer. Your own role is highlighted.' },
    ],
    tasks: [
      {
        title: 'Invite a teammate',
        steps: [
          'Choose a **Role** and a **Link expires** time.',
          'Click **Create invite link**.',
          'Click **Copy link** and send it yourself, in chat or email; CanonTracker doesn’t send email yet.',
          'Your teammate opens the link, creates an account or logs in, and joins with the role you chose.',
        ],
      },
      {
        title: 'Change someone’s role',
        steps: [
          'Find the person under **Members**.',
          'Pick the new role in their role menu; it saves at once.',
        ],
      },
      {
        title: 'Remove a member or leave the studio',
        steps: [
          'Click **Remove** next to the person, or **Leave** on your own row.',
          'Confirm; they lose access to the studio and its projects, and their past decisions stay in the audit log.',
        ],
      },
      {
        title: 'Revoke an invite link',
        steps: [
          'Under **Open invite links**, click **Revoke** next to the link.',
          'Confirm with **Revoke link**; anyone who has it can no longer join.',
        ],
      },
    ],
    sections: [
      {
        title: 'Invite links',
        points: [
          'Each link works once, for one person, until it expires or you revoke it.',
          'The invite page shows the studio, who invited you, **Your role** and when the link expires.',
          'Without an account, choose **Create an account to join** or **I already have an account**. Signed in, the button joins with the account you are using.',
          'A used, expired or revoked link says so; ask the person who sent it for a new one.',
        ],
      },
      {
        title: 'Owners',
        points: [
          'Only owners can invite, promote, demote or remove an owner.',
          'A studio always keeps at least one owner. To hand it over, make someone else an owner first.',
        ],
      },
    ],
    roles: [
      { role: 'Owner', can: 'Everything an admin can, plus invite owners and change or remove other owners.' },
      { role: 'Admin', can: 'Create and revoke invite links, change roles and remove members (not owners).' },
      { role: 'Editor, viewer', can: 'See the members and the role list, and leave the studio.' },
    ],
    related: ['roles', 'settings', 'profile', 'projects'],
    keywords: ['invite', 'invitation', 'members', 'add people', 'remove member', 'leave studio', 'role', 'owner', 'admin', 'editor', 'viewer'],
  },
  {
    slug: 'projects',
    group: 'studio',
    title: 'Projects',
    summary: 'Every story world in the studio: create a project, open one, and set its medium, art style, research profile, conflict defaults and entity types.',
    where: 'Sidebar → **Projects**, or the project switcher → **All projects**',
    shot: { name: 'projects', alt: 'The Projects tab listing the studio’s projects with medium, sources, canon, members and last activity.' },
    see: [
      { label: 'Project list', text: 'Each project with its medium, number of sources, canon facts, members and last activity. **Open now** marks the one you are in; a badge counts candidates to review.' },
      { label: 'New project', text: 'A name, a **Start with** choice (an empty project or one of the samples) and, for an empty project, its **Medium**. Owners and admins only.' },
      { label: 'Project page', text: 'Click a project name. At the top: counts, and **Open project** (or **Go to home** if it is open now).' },
      { label: 'General', text: '**Project name**, **Medium** (decides the fields on entity pages) and **Art style** (added to every generated image).' },
      { label: 'Research profile', text: 'Field, **Period**, **Place**, **Legal system or procedure** and **Notes for research**, sent with every Research question in the project.' },
      { label: 'Conflict severity by rule', text: 'For each conflict rule, whether new scans mark it **Hard** or **Soft**.' },
      { label: 'Entity types and Danger zone', text: 'The project’s **Entity types**, and **Danger zone**, which replaces the project’s content with a sample.' },
    ],
    tasks: [
      {
        title: 'Create a project',
        steps: [
          'Click **New project**.',
          'Type a **Story or project name**.',
          'In **Start with**, keep **An empty project** or pick a sample: Broken Tide, Lantern Row, The Ashbell Pass, Sherlock Holmes, the Oz books or Alice.',
          'For an empty project, pick its **Medium**: novel or prose, film or series, or game. A sample sets its own.',
          'Click **Create and open**; the new project opens on Home.',
        ],
      },
      {
        title: 'Set the medium and art style',
        steps: [
          'Click the project in the list.',
          'Under **General**, pick a **Medium**: game, novel or prose, or film or series.',
          'Type an **Art style**; it saves when you stop typing.',
        ],
      },
      {
        title: 'Edit entity types',
        steps: [
          'Open the project, then its page; a project that isn’t open shows **Open and edit types**.',
          'Click **Add type**, or the edit button on a type, and set **Name**, **Plural**, **Colour** and **Icon**.',
          'To remove a type that pages use, pick the type they become in **Move pages to** and confirm.',
        ],
      },
      {
        title: 'Replace a project with a sample',
        steps: [
          'On the project page, find **Danger zone**.',
          'Click **Replace with this** next to the sample you want.',
          'Confirm; sources, canon, conflicts and changes are replaced, the audit trail keeps its history and other projects are not touched.',
        ],
      },
    ],
    sections: [
      {
        title: 'What these settings do and don’t touch',
        points: [
          'Changing the medium keeps every value already filled in on entity pages; it only changes which fields show.',
          'Before any entity page exists, a medium change also swaps the default entity types.',
          'Entity types are notes for your team: canon, conflicts and impact never use them. Renaming a type keeps every page’s type.',
          'Severity defaults apply to new scans. Existing conflicts keep theirs.',
          'Each project is separate: nothing is shared between projects.',
        ],
      },
    ],
    roles: [
      { role: 'Owner, admin', can: 'Create projects, change name, medium, art style, research profile and severity defaults, and replace a project with a sample.' },
      { role: 'Editor', can: 'Edit the entity types of the open project. Everything else on the page is read-only.' },
      { role: 'Viewer', can: 'See the list and each project’s settings, and open a project.' },
    ],
    related: ['getting-started', 'entities', 'research', 'conflict-rules', 'roles'],
    keywords: ['new project', 'switch project', 'medium', 'game', 'novel', 'film', 'art style', 'research profile', 'severity', 'entity types', 'sample', 'demo', 'reset'],
  },
  {
    slug: 'agents-api',
    group: 'studio',
    title: 'Agents & API',
    summary: 'Create API tokens and connect an AI agent or MCP client to this project, to read canon, run checks and propose candidates. A person decides what becomes canon.',
    where: 'Account menu → **Studio settings** → **Agents & API**',
    shot: { name: 'mcp', alt: 'The Agents & API tab with the token name field and the Propose only and Full access choices.' },
    see: [
      { label: 'API tokens', text: 'Create a token, see your active tokens (name, prefix, access, created, last used) and revoke them.' },
      { label: 'What it may do', text: '**Propose only** reads, proposes and runs AI checks; nothing it does becomes canon. **Full access: edits as you** can also make editorial edits (documents, pages, notes, the Library). Neither decides canon. Fixed when the token is made.' },
      { label: 'Connect your agent', text: 'Ready-made setup for **Muse Code (Meta)**, **Claude Code**, **Cursor** and **Other client**, plus a small script for your own code on the Meta Model API. Your new token is filled in.' },
      { label: 'What your agent can do', text: 'Every tool, grouped: read canon, read sources, check, read the rest of the project, propose and run checks, edit.' },
      { label: 'Try asking', text: 'Example requests to paste into your agent.' },
    ],
    tasks: [
      {
        title: 'Create a token',
        steps: [
          'Type a **Token name** that says which agent or machine uses it.',
          'Under **What it may do**, choose **Propose only** or **Full access: edits as you**.',
          'Click **Create token**.',
          'Click **Copy token** now: it starts with `sb_`, is shown once and is stored only as a hash.',
        ],
      },
      {
        title: 'Connect your agent',
        steps: [
          'Under **Connect your agent**, pick your client’s tab.',
          'Click **Copy** and paste the config or command where the tab says.',
          'The agent reaches the project at its `/mcp` address (Streamable HTTP), with the token in the `Authorization: Bearer` header.',
        ],
      },
      {
        title: 'Revoke a token',
        steps: [
          'Click **Revoke** on the token.',
          'Click **Revoke** again to confirm, or **Keep** to cancel; it stops working at once.',
        ],
      },
    ],
    sections: [
      {
        title: 'Propose only vs full access',
        points: [
          'Both levels read everything in the project: canon, sources and their history, entities, conflicts, changes, tasks, notes, research notes, conversations, the audit trail and metrics.',
          'Propose only adds proposals and AI runs, and nothing it does becomes canon: add a candidate to Review, propose a change and re-run its impact, promote a research note to a candidate, start and post in Ask conversations, ask the AI critic, re-extract a document, scan for conflicts, run a continuity check or research, and measure the gold set.',
          'A proposed candidate must quote an imported document word for word; it waits in Review marked "Agent proposal".',
          'Full access adds the editorial work your role allows, made as you and shown "via agent" in the audit trail: import and write documents, drafts, notes, tasks, entity pages (not merges), library folders and tags, images, project settings and entity types, share links, and renaming conversations.',
          'No level decides canon. Agents read canon, check facts and propose; a person decides in CanonTracker: accepting, editing or rejecting candidates, adding a fact straight to canon, deciding and reverting changes, judging conflicts and their severity, re-checking citations and merging entities. An agent that asks for one is refused.',
          'If canon has nothing, the agent is told "unknown"; it never gets invented sources.',
        ],
      },
      {
        title: 'Limits',
        points: [
          'A token belongs to you, works for one project (the one open when you made it) and always has your current role.',
          'Your role still applies: a viewer’s token reads and posts in Ask conversations (as viewers can in the app), but can’t propose or edit, whatever its level.',
          'Each token can make 120 tool calls a minute; AI tools also count toward your own hourly limits.',
          'Clients that support MCP prompts get two ready-made tasks: **Brief me on an entity** and **Continuity-check a scene**.',
          'Agent runs show in [Agent activity](/help/agent-activity) with the model id, like any AI run.',
        ],
      },
      {
        title: 'What agents can’t do',
        text: 'Use the app for these: every canon decision (Review, Conflicts, Changes, re-checks, merges), your account, studios, team changes (roles, removing members, invites), API tokens, accepting invites, loading a sample (it replaces the project), audio uploads and dictation, and file downloads (portraits, images, audio, EPUB).',
      },
    ],
    roles: [
      { role: 'Everyone', can: 'Create and revoke their own tokens. A token can do what its owner’s role allows, within its access level.' },
      { role: 'Viewer', can: 'Tokens read the project and post in Ask conversations, like a viewer in the app.' },
      { role: 'Editor and up', can: 'Propose only tokens read, propose and run AI checks; full-access tokens also make editorial edits, as you. Canon decisions stay with people.' },
    ],
    related: ['agent-activity', 'review', 'candidates-and-canon', 'roles'],
    keywords: ['mcp', 'api', 'token', 'agent', 'integration', 'claude code', 'cursor', 'muse code', 'bearer', 'propose', 'full access', 'via agent'],
  },
  {
    slug: 'roles',
    group: 'concepts',
    title: 'Roles and permissions',
    summary: 'What owners, admins, editors and viewers can do in a studio and its projects.',
    where: 'Roles are set per studio on **Team**. Your own role is on **Profile**.',
    sections: [
      {
        title: 'How roles work',
        points: [
          'A role belongs to a studio and applies to every project in it.',
          'Each role can do everything the role below it can.',
          'An owner or admin sets roles on [Team](/help/team); an invite link carries the role it was made with.',
        ],
      },
      {
        title: 'Viewer',
        text: 'Reads everything and asks; changes nothing.',
        points: [
          'Read every page of a project: Library, documents, canon, entities, conflicts, changes, tasks, notes, research notes, metrics, agent activity and the audit log.',
          'Ask canon questions and post in any conversation in Ask, in canon or research mode, and run a continuity check from Ask.',
          'Dictate into Ask with the microphone (nothing is stored).',
          'Export the story bible: Markdown, print and PDF, and EPUB.',
          'Make an API token that reads only, and leave the studio.',
        ],
      },
      {
        title: 'Editor',
        text: 'Does the canon work.',
        points: [
          'Import, write and record sources, and re-extract candidates.',
          'Accept, edit or reject candidates in Review, add facts from the reader and run the AI critic.',
          'Decide conflicts, propose, apply and revert changes, and confirm re-checks.',
          'Edit and merge entity pages, edit the project’s entity types, write notes, organise the Library, and rename conversations.',
          'Run Research and continuity checks, run evaluations on Metrics, and create or turn off share links.',
          'Agent tokens can propose; full-access tokens also make editorial edits. Only people decide canon.',
        ],
      },
      {
        title: 'Admin',
        text: 'Runs the studio and its projects.',
        points: [
          'Rename the studio.',
          'Create projects and change their name, medium, art style, research profile and conflict severity defaults.',
          'Load a sample or demo set into a project; this replaces its content.',
          'Invite people with any role but owner, change roles and remove members (not owners).',
        ],
      },
      {
        title: 'Owner',
        text: 'Everything, including the owners.',
        points: [
          'Only owners can invite, promote, demote or remove an owner.',
          'A studio always keeps at least one owner, so the last owner can’t leave or be demoted.',
        ],
      },
      {
        title: 'What stays true for every role',
        points: [
          'The AI and agents only propose. Nothing becomes canon without a person’s decision in CanonTracker; no agent token can make one.',
          'Every decision is logged under the person who made it. Removed members are never deleted, so their names stay in the audit log.',
        ],
      },
    ],
    roles: [
      { role: 'Owner', can: 'Everything, including managing owners and the studio.' },
      { role: 'Admin', can: 'Manages the team and projects, and can load sample data.' },
      { role: 'Editor', can: 'Imports sources, reviews candidates, decides conflicts and changes.' },
      { role: 'Viewer', can: 'Reads canon, asks questions, posts in conversations and exports. Can’t change canon or sources.' },
    ],
    related: ['team', 'profile', 'projects', 'agents-api', 'candidates-and-canon'],
    keywords: ['permissions', 'access', 'owner', 'admin', 'editor', 'viewer', 'read only', 'who can'],
  },
] satisfies HelpPage[]
