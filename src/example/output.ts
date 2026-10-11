const outputAnalisis = {
  "status": "NEED_INFORMATION",
  "questions": [
    {
      "key": "frontend",
      "title": "Frontend Framework",
      "description": "Pilih framework frontend yang digunakan.",
      "required": true,
      "multiple": false,
      "options": [
        "React",
        "Next.js",
        "Vue",
        "Nuxt",
        "Angular",
        "Svelte",
        "SolidJS",
        "Other"
      ]
    },
    {
      "key": "language",
      "title": "Language",
      "required": true,
      "multiple": false,
      "options": [
        "TypeScript",
        "JavaScript"
      ]
    },
    {
      "key": "styling",
      "title": "Styling",
      "required": true,
      "multiple": false,
      "options": [
        "Tailwind CSS",
        "CSS Modules",
        "SCSS",
        "Styled Components",
        "Emotion",
        "Bootstrap",
        "Material UI",
        "Ant Design",
        "Chakra UI",
        "Shadcn UI",
        "Other"
      ]
    },
    {
      "key": "state_management",
      "title": "State Management",
      "required": false,
      "multiple": false,
      "options": [
        "Zustand",
        "Redux Toolkit",
        "Context API",
        "Jotai",
        "MobX",
        "Pinia",
        "Vuex",
        "None",
        "Other"
      ]
    }
  ]
}