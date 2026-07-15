import { NavLink, Outlet } from "react-router-dom";

export function AppShell() {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <h1>Learning OS</h1>
        <nav className="stack compact">
          <NavLink to="/">导入</NavLink>
          <NavLink to="/library">知识库</NavLink>
          <NavLink to="/review">复习</NavLink>
          <NavLink to="/search">搜索</NavLink>
          <NavLink to="/settings">设置</NavLink>
        </nav>
      </aside>
      <div className="content">
        <Outlet />
      </div>
    </div>
  );
}
