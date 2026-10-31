import type { Equipment } from '@equipdemo/contracts';

const price = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 });

export function EquipmentTable({ items }: { items: Equipment[] }) {
  if (items.length === 0) {
    return <p>No equipment yet.</p>;
  }
  return (
    <table>
      <caption>{items.length === 1 ? '1 item' : `${items.length} items`}</caption>
      <thead>
        <tr>
          <th scope="col">ID</th>
          <th scope="col">Name</th>
          <th scope="col">Price per hour</th>
        </tr>
      </thead>
      <tbody>
        {items.map(item => (
          <tr key={item.id}>
            <td>{item.id}</td>
            <td>{item.name}</td>
            <td>{price.format(item.price_per_hour)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
