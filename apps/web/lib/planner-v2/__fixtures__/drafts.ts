/**
 * The 27 real planner intakes (external users, Aug to Oct 2026), anonymised:
 * no artist names, names in notes replaced. Source: work/planner/drafts.json.
 */
export type DraftFixture = {
  id: string;
  created: string;
  release_type: 'single' | 'ep' | 'album';
  goal: string;
  budget: string;
  ready_today: string[];
  release_date: string | null;
  goal_text: string;
  notes: string;
};

export const DRAFT_FIXTURES: DraftFixture[] = [
  {
    "id": "d1",
    "created": "2026-08-10",
    "release_type": "ep",
    "goal": "playlist_adds",
    "budget": "under_100k",
    "ready_today": [
      "master",
      "artwork"
    ],
    "release_date": "2026-09-25",
    "goal_text": "",
    "notes": "T shirt and cap merch available"
  },
  {
    "id": "d2",
    "created": "2026-08-12",
    "release_type": "single",
    "goal": "new_listeners",
    "budget": "100k_500k",
    "ready_today": [
      "master",
      "artwork",
      "visualizer",
      "distributor"
    ],
    "release_date": "2026-11-11",
    "goal_text": "",
    "notes": ""
  },
  {
    "id": "d3",
    "created": "2026-08-12",
    "release_type": "single",
    "goal": "new_listeners",
    "budget": "none",
    "ready_today": [
      "master",
      "artwork",
      "distributor"
    ],
    "release_date": "2026-08-12",
    "goal_text": "",
    "notes": ""
  },
  {
    "id": "d4",
    "created": "2026-08-13",
    "release_type": "single",
    "goal": "new_listeners",
    "budget": "none",
    "ready_today": [
      "master",
      "artwork"
    ],
    "release_date": "2026-08-31",
    "goal_text": "",
    "notes": ""
  },
  {
    "id": "d5",
    "created": "2026-08-14",
    "release_type": "ep",
    "goal": "new_listeners",
    "budget": "100k_500k",
    "ready_today": [
      "master",
      "artwork",
      "visualizer",
      "distributor"
    ],
    "release_date": "2026-08-28",
    "goal_text": "",
    "notes": ""
  },
  {
    "id": "d6",
    "created": "2026-08-17",
    "release_type": "ep",
    "goal": "fan_moment",
    "budget": "100k_500k",
    "ready_today": [
      "none"
    ],
    "release_date": "2026-11-11",
    "goal_text": "",
    "notes": "Three DJs are on the project.  We'd like to have multiple listening parties where listeners paint the artwork to the project and they earn royalties off the project for life."
  },
  {
    "id": "d7",
    "created": "2026-08-18",
    "release_type": "ep",
    "goal": "new_listeners",
    "budget": "under_100k",
    "ready_today": [
      "master",
      "artwork",
      "distributor"
    ],
    "release_date": "2026-10-12",
    "goal_text": "",
    "notes": ""
  },
  {
    "id": "d8",
    "created": "2026-08-19",
    "release_type": "single",
    "goal": "new_listeners",
    "budget": "over_500k",
    "ready_today": [
      "master",
      "artwork",
      "visualizer",
      "distributor"
    ],
    "release_date": "2026-08-20",
    "goal_text": "",
    "notes": ""
  },
  {
    "id": "d9",
    "created": "2026-08-24",
    "release_type": "ep",
    "goal": "new_listeners",
    "budget": "100k_500k",
    "ready_today": [
      "none"
    ],
    "release_date": "2026-11-07",
    "goal_text": "playlist adds and a wider reach for an existing artiste.",
    "notes": "still at the writing and recording phase"
  },
  {
    "id": "d10",
    "created": "2026-09-02",
    "release_type": "single",
    "goal": "fan_moment",
    "budget": "under_100k",
    "ready_today": [
      "master",
      "artwork"
    ],
    "release_date": "2026-10-02",
    "goal_text": "",
    "notes": ""
  },
  {
    "id": "d11",
    "created": "2026-09-02",
    "release_type": "ep",
    "goal": "playlist_adds",
    "budget": "100k_500k",
    "ready_today": [
      "master",
      "artwork"
    ],
    "release_date": "2026-11-13",
    "goal_text": "",
    "notes": "Collaboration with another artist , merch design for the the EP, shoot contents, set up all social media platforms for promo and ads"
  },
  {
    "id": "d12",
    "created": "2026-09-11",
    "release_type": "ep",
    "goal": "catalog",
    "budget": "none",
    "ready_today": [
      "master",
      "distributor"
    ],
    "release_date": "2026-10-09",
    "goal_text": "",
    "notes": "I want to create the cover art and release on distribution as soon as possible."
  },
  {
    "id": "d13",
    "created": "2026-10-01",
    "release_type": "single",
    "goal": "new_listeners",
    "budget": "over_500k",
    "ready_today": [
      "master",
      "artwork",
      "visualizer",
      "distributor"
    ],
    "release_date": "2026-10-02",
    "goal_text": "",
    "notes": ""
  },
  {
    "id": "d14",
    "created": "2026-10-09",
    "release_type": "ep",
    "goal": "playlist_adds",
    "budget": "under_100k",
    "ready_today": [
      "master",
      "visualizer"
    ],
    "release_date": "2026-10-23",
    "goal_text": "Creating a budget friendly but effective rollout consisting of a solid content calendar, marketing strategy and possible fund generation plan.",
    "notes": ""
  },
  {
    "id": "d15",
    "created": "2026-10-11",
    "release_type": "single",
    "goal": "new_listeners",
    "budget": "none",
    "ready_today": [
      "master",
      "artwork",
      "visualizer",
      "distributor"
    ],
    "release_date": "2026-11-20",
    "goal_text": "",
    "notes": ""
  },
  {
    "id": "d16",
    "created": "2026-10-11",
    "release_type": "album",
    "goal": "new_listeners",
    "budget": "over_500k",
    "ready_today": [
      "master",
      "artwork",
      "visualizer",
      "distributor"
    ],
    "release_date": "2027-02-12",
    "goal_text": "",
    "notes": ""
  },
  {
    "id": "d17",
    "created": "2026-10-11",
    "release_type": "ep",
    "goal": "new_listeners",
    "budget": "100k_500k",
    "ready_today": [
      "master",
      "artwork",
      "distributor"
    ],
    "release_date": "2027-01-15",
    "goal_text": "",
    "notes": ""
  },
  {
    "id": "d18",
    "created": "2026-10-12",
    "release_type": "single",
    "goal": "playlist_adds",
    "budget": "none",
    "ready_today": [
      "master",
      "artwork",
      "visualizer",
      "distributor"
    ],
    "release_date": "2026-10-28",
    "goal_text": "",
    "notes": ""
  },
  {
    "id": "d19",
    "created": "2026-10-12",
    "release_type": "single",
    "goal": "playlist_adds",
    "budget": "100k_500k",
    "ready_today": [
      "master",
      "artwork"
    ],
    "release_date": "2026-12-11",
    "goal_text": "",
    "notes": ""
  },
  {
    "id": "d20",
    "created": "2026-10-13",
    "release_type": "single",
    "goal": "new_listeners",
    "budget": "none",
    "ready_today": [
      "master",
      "artwork"
    ],
    "release_date": "2026-10-30",
    "goal_text": "",
    "notes": ""
  },
  {
    "id": "d21",
    "created": "2026-10-14",
    "release_type": "single",
    "goal": "new_listeners",
    "budget": "100k_500k",
    "ready_today": [
      "none"
    ],
    "release_date": "2026-10-28",
    "goal_text": "",
    "notes": ""
  },
  {
    "id": "d22",
    "created": "2026-10-21",
    "release_type": "single",
    "goal": "new_listeners",
    "budget": "none",
    "ready_today": [
      "artwork",
      "distributor"
    ],
    "release_date": "2026-11-23",
    "goal_text": "",
    "notes": ""
  },
  {
    "id": "d23",
    "created": "2026-10-21",
    "release_type": "single",
    "goal": "new_listeners",
    "budget": "none",
    "ready_today": [
      "master"
    ],
    "release_date": "2026-12-04",
    "goal_text": "",
    "notes": ""
  },
  {
    "id": "d24",
    "created": "2026-10-21",
    "release_type": "single",
    "goal": "new_listeners",
    "budget": "none",
    "ready_today": [
      "master",
      "artwork",
      "visualizer",
      "distributor"
    ],
    "release_date": "2026-12-14",
    "goal_text": "",
    "notes": ""
  },
  {
    "id": "d25",
    "created": "2026-10-21",
    "release_type": "album",
    "goal": "new_listeners",
    "budget": "none",
    "ready_today": [
      "master",
      "artwork",
      "distributor"
    ],
    "release_date": "2026-11-03",
    "goal_text": "",
    "notes": ""
  },
  {
    "id": "d26",
    "created": "2026-10-22",
    "release_type": "single",
    "goal": "catalog",
    "budget": "100k_500k",
    "ready_today": [
      "master"
    ],
    "release_date": "2026-11-09",
    "goal_text": "",
    "notes": ""
  },
  {
    "id": "d27",
    "created": "2026-10-22",
    "release_type": "single",
    "goal": "new_listeners",
    "budget": "none",
    "ready_today": [
      "master"
    ],
    "release_date": "2026-11-09",
    "goal_text": "",
    "notes": ""
  }
];
