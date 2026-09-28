export default function UnauthorizedPage() {
  return (
    <main className="authPage">
      <section className="authCard">
        <p className="eyebrow">Access denied</p>
        <h1>Permission required</h1>
        <p className="muted">Your account is authenticated, but its assigned role cannot open this resource.</p>
        <a className="buttonLink" href="/admin/dashboard">Return to dashboard</a>
      </section>
    </main>
  );
}
