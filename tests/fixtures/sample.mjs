// Realistic sample entries used by the tests and screenshot tool.
// Dates are relative to "today" so the stats screens always have something to show.

const daysAgo = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export function sampleEntries() {
  return [
    {
      date: daysAgo(0), minutes: 45, platform: 'Bandit', room: 'Bandit Level 4 → 5',
      link: 'https://overthewire.org/wargames/bandit/bandit5.html', tags: ['Linux'],
      did: 'Looked through ./inhere for the only human-readable file.',
      learned: 'The file command tells you what type a file really is, whatever its name says.',
      explain: 'Files can lie about what they are with their names. `file` peeks inside and tells you the truth, like checking what is actually in a box instead of reading the label.',
      commands: [
        { cmd: 'file ./inhere/*', what: 'Shows the real type of every file in the folder', example: 'file ./-file07' },
        { cmd: 'cat ./-file07', what: 'Prints a file whose name starts with a dash' },
      ],
      questions: [{ q: 'Why does cat -file07 fail without the ./ in front?', solved: false, answer: '' }],
      confidence: 4, flag: 'FAKE-flag-for-tests-0001',
    },
    {
      date: daysAgo(2), minutes: 60, platform: 'TryHackMe', room: 'Linux Privilege Escalation',
      link: 'https://tryhackme.com/room/linprivesc', tags: ['Linux', 'Red team'],
      did: 'Worked through the SUID and sudo sections.',
      learned: 'SUID programs run with the owner\'s permissions, so a root-owned SUID binary can be a way in.',
      explain: '',
      commands: [
        { cmd: 'find / -perm -4000 2>/dev/null', what: 'Lists programs with the SUID bit set, hiding permission errors' },
        { cmd: 'sudo -l', what: 'Shows what you are allowed to run with sudo' },
      ],
      questions: [
        { q: 'What does 2>/dev/null actually do?', solved: true, answer: 'Sends error messages (stream 2) to the bin so only real results show.' },
        { q: 'How is SGID different from SUID?', solved: false, answer: '' },
      ],
      confidence: 2,
    },
    {
      date: daysAgo(9), minutes: 30, platform: 'CyberDefenders', room: 'PacketMaze', tags: ['Networking', 'Blue team'],
      learned: 'Wireshark display filters narrow a capture down to just the conversation you care about.',
      explain: 'A packet capture is like CCTV of the network. Display filters are fast-forwarding to just the bits with one person in them.',
      commands: [{ cmd: 'ip.addr == 10.0.0.5 && tcp.port == 80', what: 'Wireshark filter: traffic to/from one host on port 80' }],
      confidence: 1,
    },
    {
      date: daysAgo(16), minutes: 90, platform: 'Homelab', room: 'Kali + Metasploitable in VirtualBox', tags: ['Homelab', 'Networking'],
      did: 'Set up a host-only network so the vulnerable VM can\'t reach the internet.',
      learned: 'Host-only networking keeps lab machines isolated from the real network.',
      commands: [{ cmd: 'nmap -sV 192.168.56.0/24', what: 'Scans the lab network and guesses service versions' }],
      confidence: 3,
    },
    {
      date: daysAgo(30), minutes: 15, platform: 'TryHackMe', room: 'Intro to Logs', tags: ['Blue team'],
      learned: 'Windows Event ID 4625 means a failed logon.', quick: true,
    },
  ];
}
