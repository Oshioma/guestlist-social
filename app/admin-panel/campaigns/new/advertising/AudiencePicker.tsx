"use client";
import { useState } from "react";
// Icon imports (install react-icons: npm install react-icons)
import { FaMagic, FaUserFriends, FaMapMarkerAlt, FaSlidersH } from "react-icons/fa";

type AudienceChoice = "smart" | "lookalike" | "local" | "custom";
type CustomAudience = {
  ageMin: number;
  ageMax: number;
  gender: string;
  location: string;
};

type Props = {
  next: (values: any) => void;
  back: () => void;
  data?: any;
};

export default function AudiencePicker({ next, back, data }: Props) {
  const [choice, setChoice] = useState<AudienceChoice>(data?.audience?.type || "smart");
  const [custom, setCustom] = useState<CustomAudience>(
    data?.audience?.custom || { ageMin: 25, ageMax: 45, gender: "Any", location: "" }
  );

  function handleCustomChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    const { name, value } = e.target;
    setCustom(prev => ({
      ...prev,
      [name]: name === "ageMin" || name === "ageMax" ? Number(value) : value
    }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // Store either simple type, or {type:"custom", custom: {...}}
    next(
      choice === "custom"
        ? { audience: { type: "custom", custom } }
        : { audience: { type: choice } }
    );
  }

  return (
    <form
      className="space-y-8"
      onSubmit={handleSubmit}
      autoComplete="off"
    >
      <h2 className="text-2xl font-semibold mb-3">Who should see your ad?</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <AudienceOption
          icon={<FaMagic size={30} className="text-blue-600" />}
          value="smart"
          selected={choice === "smart"}
          title="Smart Audience"
          desc="Let Facebook & Instagram automatically find the right people for your ad."
          onClick={() => setChoice("smart")}
        />
        <AudienceOption
          icon={<FaUserFriends size={28} className="text-green-600" />}
          value="lookalike"
          selected={choice === "lookalike"}
          title="People like your followers"
          desc="Show your ad to people similar to your Page or account's current followers."
          onClick={() => setChoice("lookalike")}
        />
        <AudienceOption
          icon={<FaMapMarkerAlt size={28} className="text-pink-600" />}
          value="local"
          selected={choice === "local"}
          title="Nearby people"
          desc="Reach people near your store, business or city."
          onClick={() => setChoice("local")}
        />
        <AudienceOption
          icon={<FaSlidersH size={27} className="text-gray-700" />}
          value="custom"
          selected={choice === "custom"}
          title="Choose audience myself"
          desc="Pick age, gender and location."
          onClick={() => setChoice("custom")}
        />
      </div>

      {choice === "custom" && (
        <div className="rounded border bg-gray-50 p-4 space-y-4 mt-1">
          <div>
            <label className="block font-medium">Age range</label>
            <div className="flex gap-2 mt-1">
              <input
                type="number"
                min={13}
                max={99}
                name="ageMin"
                value={custom.ageMin}
                onChange={handleCustomChange}
                className="border p-1 rounded w-16"
                aria-label="Minimum age"
              />
              <span className="mx-1">to</span>
              <input
                type="number"
                min={13}
                max={99}
                name="ageMax"
                value={custom.ageMax}
                onChange={handleCustomChange}
                className="border p-1 rounded w-16"
                aria-label="Maximum age"
              />
              <span className="text-gray-500 ml-2">years old</span>
            </div>
            <span className="text-gray-400 text-xs ml-1">
              Most ads must be 18+ depending on product.
            </span>
          </div>
          <div>
            <label className="block font-medium mb-1">Gender</label>
            <select
              name="gender"
              value={custom.gender}
              onChange={handleCustomChange}
              className="border rounded px-2 py-1"
            >
              <option value="Any">Everyone</option>
              <option value="Female">Women only</option>
              <option value="Male">Men only</option>
            </select>
          </div>
          <div>
            <label className="block font-medium mb-1">Location</label>
            <input
              name="location"
              value={custom.location}
              onChange={handleCustomChange}
              className="border w-full rounded px-2 py-1"
              placeholder="e.g. New York, United States"
            />
            <span className="text-gray-400 text-xs ml-1">
              Leave blank to include all locations.
            </span>
          </div>
        </div>
      )}

      <div className="flex justify-between mt-6">
        <button
          type="button"
          onClick={back}
          className="bg-gray-300 px-5 py-2 rounded font-semibold"
        >
          Back
        </button>
        <button
          type="submit"
          className="bg-blue-700 hover:bg-blue-800 px-6 py-2 text-white font-semibold rounded"
        >
          Next
        </button>
      </div>
    </form>
  );
}

// Visual option card component
function AudienceOption({
  icon,
  title,
  desc,
  value,
  selected,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  value: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`block text-left border rounded p-4 w-full flex gap-4 items-center shadow-sm transition-all ring-0 focus:ring-2 outline-none
      ${selected ? "border-blue-600 ring-2 ring-blue-200 bg-blue-50" : "hover:border-blue-400 bg-white"}`}
      onClick={onClick}
    >
      <div>{icon}</div>
      <div>
        <div className="font-bold mb-0.5">{title}</div>
        <div className="text-gray-500 text-sm">{desc}</div>
      </div>
    </button>
  );
}
