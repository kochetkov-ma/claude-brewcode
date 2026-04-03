## Project context

### Stack
- Framework: React 18 with JSX
- CSS approach: CSS Modules (.module.css files)
- Language: JavaScript (not TypeScript)

### File structure convention
- Components in separate files: ComponentName.jsx + ComponentName.module.css
- Entry point: index.html that loads main.jsx via <script type="module">
- Use ES modules (import/export)

### Component structure
Each component should be a separate file pair:
- Header.jsx + Header.module.css
- Sidebar.jsx + Sidebar.module.css
- MainContent.jsx + MainContent.module.css
- etc.

### Additional rules
- Use React.createElement or JSX (assume Babel/build step will handle JSX)
- Export each component as default
- Import CSS modules as `import styles from './Component.module.css'`
- Use className={styles.className} pattern
- App.jsx is the root component that composes all others
