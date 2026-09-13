(function () {
  "use strict";

  // Starter broadcast pool. The scheduler is deliberately independent of pool size:
  // when this list reaches 144+ playable videos, every daily slot can be unique.
  // Until then it exhausts the whole pool before reshuffling, so repeats are spaced out.
  const rows = [
    ["Ozzy Osbourne","Crazy Train","FVovq9TGBw0"],
    ["Ozzy Osbourne","Mama, I'm Coming Home","K0siYUjV9UM"],
    ["Ozzy Osbourne","No More Tears","CprfjfN5PRs"],
    ["Black Sabbath","Paranoid","0qanF-91aJo"],
    ["Metallica","Enter Sandman","CD-E-LDc384"],
    ["Metallica","Nothing Else Matters","tAGnKpE4NCI"],
    ["Metallica","One","WM8bTdBs-cw"],
    ["Metallica","Sad But True","A8MO7fkZc5o"],
    ["Metallica","Wherever I May Roam","Z-cEyiM9adE"],
    ["Metallica","Whiskey in the Jar","wsrvmNtWU4E"],
    ["Iron Maiden","Run to the Hills","86URGgqONvA"],
    ["Iron Maiden","Wasted Years","Ij99dud8-0A"],
    ["Iron Maiden","The Trooper","X4bgXH3sJ2Q"],
    ["Judas Priest","Breaking the Law","L397TWLwrUU"],
    ["Megadeth","Symphony of Destruction","h2LG7JXK5mQ"],
    ["Megadeth","Holy Wars... The Punishment Due","9d4ui9q7eDM"],
    ["Megadeth","Sweating Bullets","aOnKCcjP8Qs"],
    ["Pantera","Walk","AkFqg5wAuFk"],
    ["Pantera","Cowboys from Hell","i97OkCXwotE"],
    ["AC/DC","Back in Black","pAgnJDJN4VA"],
    ["AC/DC","Thunderstruck","v2AC41dglnM"],
    ["AC/DC","Highway to Hell","l482T0yNkeo"],
    ["AC/DC","You Shook Me All Night Long","Lo2qQmj0_h4"],
    ["Guns N' Roses","Sweet Child O' Mine","1w7OgIMMRc4"],
    ["Guns N' Roses","Welcome to the Jungle","o1tj2zJ2Wvg"],
    ["Guns N' Roses","Paradise City","Rbm6GXllBiw"],
    ["Guns N' Roses","November Rain","8SbUC-UaAxE"],
    ["Bon Jovi","Livin' on a Prayer","lDK9QqIzhwk"],
    ["Bon Jovi","You Give Love a Bad Name","KrZHPOeOxQQ"],
    ["Bon Jovi","Wanted Dead or Alive","SRvCvsRp5ho"],
    ["Scorpions","Rock You Like a Hurricane","6yP1tcy9a10"],
    ["Whitesnake","Here I Go Again","WyF8RHM1OCg"],
    ["Van Halen","Jump","SwYN7mTi6HM"],
    ["Van Halen","Panama","fuKDBPw8wQA"],
    ["Van Halen","Hot for Teacher","6M4_Ommfvv0"],
    ["Ratt","Round and Round","0u8teXR8VE4"],
    ["Poison","Every Rose Has Its Thorn","j2r2nDhTzO4"],
    ["Alice Cooper","Poison","Qq4j1LtCdww"],
    ["Twisted Sister","We're Not Gonna Take It","4xmckWVPRaI"],
    ["Twisted Sister","I Wanna Rock","SRwrg0db_zY"],
    ["Quiet Riot","Cum On Feel the Noize","ZxgMGk9JPVA"],
    ["Nirvana","Smells Like Teen Spirit","hTWKbfoikeg"],
    ["Nirvana","Come As You Are","vabnZ9-ex7o"],
    ["Foo Fighters","Everlong","eBG7P-K-r1Y"],
    ["Foo Fighters","The Pretender","SBjQ9tuuTJQ"],
    ["Pearl Jam","Jeremy","MS91knuzoOA"],
    ["Soundgarden","Black Hole Sun","3mbBbFH9fAg"],
    ["Alice in Chains","Man in the Box","TAqZb52sgpU"],
    ["Alice in Chains","Would?","Nco_kh8xJDs"],
    ["Stone Temple Pilots","Plush","V5UOC0C0x8Q"],
    ["Red Hot Chili Peppers","Give It Away","Mr_uHJPUlO8"],
    ["Rage Against the Machine","Killing in the Name","bWXazVhlyxQ"],
    ["System of a Down","Chop Suey!","CSvFpBOe8eY"],
    ["System of a Down","Toxicity","iywaBOMvYLI"],
    ["Slipknot","Duality","6fVE8kSM43I"],
    ["Slipknot","Before I Forget","qw2LU1yS7aw"],
    ["Korn","Freak on a Leash","jRGrNDV2mKc"],
    ["Linkin Park","One Step Closer","4qlCC1GOwFw"],
    ["Linkin Park","Faint","LYU-8IFcDPw"],
    ["Linkin Park","Numb","kXYiU_JCYtU"],
    ["Linkin Park","In the End","eVTXPUF4Oz4"],
    ["Dio","Holy Diver","2lvs2FzF64o"],
    ["Dio","Rainbow in the Dark","PrBUjXaRSUQ"],
    ["Queen","Another One Bites the Dust","rY0WxgSXdEE"],
    ["Queen","We Will Rock You","-tJYN-eG1zk"],
    ["Queen","I Want It All","hFDcoX7s6rE"],
    ["Jane's Addiction","Been Caught Stealing","jrwjiO1MCVs"],
    ["Jane's Addiction","Stop!","ZwI02OHtZTg"],
    ["Social Distortion","Ball and Chain","_NWjehpGSO0"],
    ["The Black Crowes","Hard to Handle","BRcs_OzQb14"],
    ["Faith No More","Epic","ZG_k5CSYKhg"],
    ["Sonic Youth","Kool Thing","SDTSUwIZdMk"],
    ["The Replacements","Bastards of Young","fl9KQ1Mub6Q"],
    ["INXS","Need You Tonight","F93ywiGMDnQ"],
    ["The Cure","Just Like Heaven","n3nPiBai66M"],
    ["R.E.M.","The One I Love","j7oQEPfe-O8"],
    ["The Church","Under the Milky Way","pWxJEIz7sSA"],
    ["Pixies","Where Is My Mind?","OJ62RzJkYUo"],
    ["Depeche Mode","Personal Jesus","u1xrNaTO1bI"],
    ["The Stone Roses","She Bangs the Drums","wD6Pq0bSMPo"]
  ];

  if (new Set(rows.map(row => row[2])).size !== rows.length) {
    throw new Error("Ozzy TV catalog contains a duplicate YouTube video id.");
  }

  window.HERMIT_CATALOG = rows.map(function (row, index) {
    return {
      id:"OZZY-TV-" + String(index + 1).padStart(3,"0"),
      artist:row[0],
      title:row[0] + " — " + row[1],
      songTitle:row[1],
      year:null,
      collection:"Rock / Heavy Metal Music Video",
      videoId:row[2],
      networkChannel:"OZZY-TV",
      contentClass:"Music Video",
      rating:"Music",
      cleared:true,
      posterUrl:""
    };
  });

  window.INFINITY_CHANNEL = {
    id:"OZZY-TV",
    sourcePolicy:"Direct YouTube music-video embeds selected for a rock and heavy-metal television rotation.",
    schedulePolicy:"144 ten-minute station slots per local day. A new seeded seven-day rotation is generated every calendar week; each day gets a different ordering and the pool is exhausted before any repeat when possible.",
    slotSeconds:600,
    slotsPerDay:144,
    slotsPerWeek:1008
  };

  // These are reserved inventory labels, not paid ads yet. The app displays them only
  // after a music video naturally finishes and until the next ten-minute slot begins.
  window.HERMIT_COMMERCIALS = [
    {id:"OZZY-BREAK-1",title:"Ozzy TV Intermission · next video at the next slot",durationSeconds:60,videoId:"",cleared:true},
    {id:"OZZY-BREAK-2",title:"Reserved · guitars, amps, records & concert advertising",durationSeconds:60,videoId:"",cleared:true},
    {id:"OZZY-BREAK-3",title:"Reserved · rock and metal advertising",durationSeconds:60,videoId:"",cleared:true}
  ];
})();
