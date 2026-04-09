import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { installApiBaseUrlInterceptor } from './config/runtime.ts'

installApiBaseUrlInterceptor()

// Prevent scroll wheel from changing number input values globally
document.addEventListener('wheel', () => {
  if (
    document.activeElement instanceof HTMLInputElement &&
    document.activeElement.type === 'number'
  ) {
    document.activeElement.blur();
  }
});

createRoot(document.getElementById("root")!).render(<App />);
