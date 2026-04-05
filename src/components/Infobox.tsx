import type { Infobox as InfoboxType } from "@/lib/types";

interface Props {
  title: string;
  infobox: InfoboxType;
}

export default function Infobox({ title, infobox }: Props) {
  return (
    <div className="infobox">
      <div className="infobox-header">{title}</div>
      <div className="infobox-image">[ Photo ]</div>
      <table>
        <tbody>
          {Object.entries(infobox).map(([key, value]) => (
            <tr key={key}>
              <th>{key.replace(/_/g, " ")}</th>
              <td>{Array.isArray(value) ? value.join(", ") : value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
