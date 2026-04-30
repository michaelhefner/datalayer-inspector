export default function KVTable({ data }) {
  const entries = Object.entries(data);
  if (entries.length === 0) return <div className="ri-empty">No entries</div>;
  return (
    <table className="ri-kv-table">
      <tbody>
        {entries.map(([k, v]) => (
          <tr key={k} className="ri-kv-row">
            <td className="ri-kv-name">{k}</td>
            <td className="ri-kv-value">
              {typeof v === 'object' ? JSON.stringify(v) : String(v)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}