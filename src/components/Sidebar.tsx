import React from 'react';
import { NavLink } from 'react-router-dom';

export default function Sidebar() {
  return (
    <div className="w-64 bg-background border-r h-full p-4">
      <div className="space-y-2">
        <NavLink to="/" className="block px-3 py-2 rounded hover:bg-muted">
          Home
        </NavLink>
        <NavLink to="/dashboard" className="block px-3 py-2 rounded hover:bg-muted">
          Dashboard
        </NavLink>
        {/*__NAV__*/}
        <NavLink to="/chat" className="block px-3 py-2 rounded hover:bg-muted">
          Chat
        </NavLink>
        <NavLink to="/roadmap" className="block px-3 py-2 rounded hover:bg-muted">
          Roadmap
        </NavLink>
        <NavLink to="/health" className="block px-3 py-2 rounded hover:bg-muted">
          Health
        </NavLink>
      </div>
    </div>
  );
}