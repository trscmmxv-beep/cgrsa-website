/* ==========================================================================
   CGRSA WEBSITE DATA: edit this file to update the website.
   - Logos/photos: put image files in the folder shown and write the file name.
   - Leave a value as "" if you don't have it yet; the site shows "To be announced".
   ========================================================================== */

/* ---------- State discipline heads (shown on the home page) ---------- */
const DISCIPLINE_HEADS = [
  { discipline: "Speed Skating",     name: "", photo: "" },   // photo: "assets/people/speed-head.jpg"
  { discipline: "Artistic Skating",  name: "", photo: "" },
  { discipline: "Roller Hockey",     name: "", photo: "" },
  { discipline: "Inline Hockey",     name: "", photo: "" },
  { discipline: "Skateboarding",     name: "", photo: "" },
  { discipline: "Inline Freestyle",  name: "", photo: "" },
];

/* ---------- District associations ---------- */
/* logo: "assets/districts/durg.png"   bearers: [{ post: "President", name: "", photo: "" }, ...] */
const DISTRICTS = [
  { name: "Durg Roller Sports Association",     district: "Durg",     logo: "", phone: "", email: "", bearers: [] },
  { name: "Dhamtari Roller Sports Association", district: "Dhamtari", logo: "", phone: "", email: "", bearers: [] },
  { name: "Bilaspur Roller Sports Association", district: "Bilaspur", logo: "", phone: "", email: "", bearers: [] },
  { name: "Bastar Roller Sports Association",   district: "Bastar",   logo: "", phone: "", email: "", bearers: [] },
  { name: "Raipur Roller Skating Association",  district: "Raipur",   logo: "", phone: "", email: "", bearers: [] },
  { name: "Koriya Roller Skating Association",  district: "Koriya",   logo: "", phone: "", email: "", bearers: [] },
  { name: "Raigarh Roller Skating Association", district: "Raigarh",  logo: "", phone: "", email: "", bearers: [] },
];

/* ---------- Affiliated clubs and their coaches ---------- */
/* Copy this example, remove the // and fill it in:
  {
    name: "Example Skating Club", district: "Durg", logo: "assets/clubs/example.png",
    venue: "Rink address", since: 2018, disciplines: ["Speed", "Artistic"],
    contact: "Contact person", phone: "9xxxxxxxxx",
    coaches: [ { name: "Coach name", photo: "assets/coaches/coach-name.jpg", role: "Head Coach" } ]
  },
*/
const CLUBS = [
  { name: "Trueno Sports Management",           district: "", logo: "assets/clubs/trueno-sports.jpg",      venue: "", disciplines: [], contact: "", phone: "", coaches: [] },
  { name: "Royalion Speed Skating Club",        district: "", logo: "assets/clubs/royalion.jpg",           venue: "", disciplines: [], contact: "", phone: "", coaches: [] },
  { name: "Golden Roller Skating Club",         district: "Raipur", logo: "assets/clubs/golden-roller.jpg", venue: "", disciplines: [], contact: "", phone: "", coaches: [] },
  { name: "Raigarh Skating Club (Rolling Stones)", district: "Raigarh", logo: "assets/clubs/raigarh-skating.jpg", venue: "", disciplines: [], contact: "", phone: "", coaches: [] },
  { name: "Bastar Roller Skating Club",         district: "Bastar", logo: "assets/clubs/bastar-roller.jpg", venue: "", disciplines: [], contact: "", phone: "", coaches: [] },
  { name: "Sandbox's Innovation",               district: "", logo: "assets/clubs/sandbox-innovation.jpg", venue: "", disciplines: [], contact: "", phone: "", coaches: [] },
];

/* ---------- Gallery: 3–4 photos per event (in assets/gallery/<folder>/) ---------- */
const GALLERY = [
  { title: "1st Chhattisgarh State Roller Sports Ranking Championship", year: 2026, photos: ["state-ranking-2026/1.jpg","state-ranking-2026/2.jpg","state-ranking-2026/3.jpg","state-ranking-2026/4.jpg"] },
  { title: "2nd MPower Roller Skating Championship", year: 2026, photos: ["mpower-2026/1.jpg","mpower-2026/2.jpg"] },
  { title: "Skating Carnival, DPS Chhindwara", year: 2025, photos: ["dps-chhindwara/1.jpg","dps-chhindwara/2.jpg"] },
  { title: "Skating Carnival", year: 2025, photos: ["carnival-2025/1.jpg","carnival-2025/2.jpg"] },
  { title: "1st MPower Roller Skating Championship, Mahasamund", year: 2025, photos: ["mpower-2025/1.jpg","mpower-2025/2.jpg"] },
  { title: "Durg District Championship", year: 2025, photos: ["durg-district-2025/1.jpg","durg-district-2025/2.jpg","durg-district-2025/3.jpg"] },
  { title: "17th State Roller Skating Championship", year: 2024, photos: ["state-17-2024/1.jpg","state-17-2024/2.jpg","state-17-2024/3.jpg"] },
  { title: "2nd National Ranking Roller Skating Racing Championship, KPS Sarona", year: 2022, photos: ["ranking-2022/1.jpg","ranking-2022/2.jpg","ranking-2022/3.jpg","ranking-2022/4.jpg"] },
  { title: "Team Chhattisgarh at the RSFI National Championship, Delhi & Mohali", year: 2021, photos: ["nationals-2021/1.jpg","nationals-2021/2.jpg","nationals-2021/3.jpg","nationals-2021/4.jpg"] },
  { title: "Junior Skating Events", year: "", photos: ["junior/1.jpg","junior/2.jpg","junior/4.jpg","junior/3.jpg"] },
];

/* ---------- Careers: current openings ---------- */
/* { role: "Speed Skating Coach", location: "Durg", type: "Part-time", lastDate: "31 Dec 2026", details: "" } */
const OPENINGS = [
];

/* ---------- Coaches (Clubs & Coaches page) ---------- */
/* Fill in name, area (work area / district) and club for each coach. */
const COACHES = [
  { name: "Vishal Roy", role: "Coach", area: "Bilaspur", club: "", photo: "assets/coaches/coach-1.jpg" },
  { name: "Shikhar Singh Thakur", role: "Chhattisgarh Team Physio", area: "", club: "", photo: "assets/coaches/coach-2.jpg" },
  { name: "Tanmay Nair", role: "Coach", area: "Bilaspur", club: "", photo: "assets/coaches/coach-3.jpg" },
  { name: "Vicky Roy", role: "Coach", area: "Bilaspur", club: "", photo: "assets/coaches/coach-4.jpg" },
  { name: "Akshat Jain", role: "Coach", area: "Raipur", club: "", photo: "assets/coaches/coach-5.jpg" },
  { name: "Sumit Chaurasia", role: "Coach", area: "Durg, Mahasamund", club: "", photo: "assets/coaches/coach-6.jpg" },
  { name: "Simant Avadia", role: "Coach", area: "Raipur", club: "", photo: "assets/coaches/coach-7.jpg" },
  { name: "Indra Kumar Sahu", role: "Coach", area: "Dhamtari", club: "", photo: "assets/coaches/coach-8.jpg" },
  { name: "Shresht Das", role: "Coach", area: "Bhilai", club: "", photo: "assets/coaches/coach-9.jpg" },
  { name: "Kamran Ahmed", role: "Coach", area: "Raipur", club: "", photo: "assets/coaches/coach-10.jpg" },
  { name: "Divyani Asrani", role: "Coach", area: "Raipur", club: "", photo: "assets/coaches/coach-11.jpg" },
  { name: "Anurag Bhandari", role: "Coach", area: "Durg, Raipur, Mahasamund, Dhamtari, Rajnandgaon", club: "", photo: "assets/coaches/coach-12.jpg" },
];
