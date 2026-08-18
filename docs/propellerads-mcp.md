# PropellerAds MCP Server

The [PropellerAds MCP server](https://mcp.propellerads.com) lets an AI
assistant (Claude, ChatGPT, …) work with the PropellerAds account that runs
traffic to this landing page — create and edit campaigns, check rates and
balance, pull statistics — directly from a chat.

**Connector URL:** `https://mcp.propellerads.com`

## Claude Code (this repo)

The server is already declared in [`.mcp.json`](../.mcp.json) at the repo
root, so any Claude Code session opened in this project picks it up
automatically. On first use:

1. Claude Code will ask you to approve the project-scoped server — approve it.
2. Run `/mcp` in Claude Code, select **propellerads**, and complete the
   OAuth sign-in with your PropellerAds account in the browser window that
   opens.

After that the tools are available in every session in this repo.

## Claude Desktop / claude.ai

1. Open **Settings → Connectors** and click **Add custom connector**.
2. Name: `PropellerAds MCP`, URL: `https://mcp.propellerads.com`, then
   click **Add**.
3. Click **Connect** and sign in with your PropellerAds account in the
   popup. The tools then show up in your chats.

## Available tools

Campaign management:

- Create / update campaigns per format: **Push**, **OnClick (popunder)**,
  **Interactive Ads**, **FB Traffic**, **Telegram Ads**
- Add campaign creatives, update creatives, manage creative status
- Manage campaign status (start / pause), set campaign URL

Rates & targeting:

- Get best rates per format (push, onclick, interactive, fb traffic, telegram)
- Get / set campaign rates, zone rates, and zone/sub-zone targeting
- Get / set campaign targeting; targeting lists and list types
- Get countries, regions, cities

Account & reporting:

- Get balance
- Get statistics
- Get campaign / campaigns list

## Example prompts

- *Create a Push campaign for US, CA and UK, Android only, $100 daily
  budget, CPA Goal $1.50, target url is
  `https://www.roulettewheelbonus.com/`*
- *Change the bid to $1 for campaign 11394167. Also expand targeting to
  include iPhone and set connection type strictly to Cellular.*
- *What is my current account balance?*
- *Audit my active campaigns for the last 7 days, compare performance, and
  give me three optimization actions for the weakest one — don't change
  anything without my approval.*
- *Stop all running campaigns.*

## Notes

- Authentication is per-user OAuth against your PropellerAds account — no
  API keys are stored in this repo, and `.mcp.json` contains only the
  public endpoint URL.
- The assistant acts on the live ad account. Prefer prompts that ask it to
  report before changing anything (see the audit example above).
- Support: <mcp@propellerads.com> ·
  [Help center](https://help.propellerads.com/)
