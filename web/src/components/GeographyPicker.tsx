import { useEffect, useState } from 'react';
import { fenexCities, fenexDepartments, fenexDistricts } from '../lib/fenexClient';
import type { GeoOption } from '../lib/fenexClient';
import { Label, Select } from './ui';

/**
 * Department → district → city, fed by Fenex's own geography endpoints.
 *
 * SIFEN validates the three together against the official DNIT table, and it is
 * the one rule our client-side mirror cannot reproduce. Picking from these lists
 * is what makes an invalid combination impossible to send.
 */

export interface GeoValue {
  departmentCode: string;
  departmentName: string;
  districtCode: string;
  districtName: string;
  cityCode: string;
  cityName: string;
}

const code = (o: GeoOption): string =>
  String(o.cityCode ?? o.districtCode ?? o.departmentCode ?? o.code ?? '');
const label = (o: GeoOption): string => String(o.name ?? o.description ?? '');

export default function GeographyPicker({
  value,
  onChange,
  disabled,
}: {
  value: GeoValue;
  onChange: (v: GeoValue) => void;
  disabled?: boolean;
}) {
  const [departments, setDepartments] = useState<GeoOption[]>([]);
  const [districts, setDistricts] = useState<GeoOption[]>([]);
  const [cities, setCities] = useState<GeoOption[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fenexDepartments()
      .then(setDepartments)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  useEffect(() => {
    if (!value.departmentCode) {
      setDistricts([]);
      return;
    }
    fenexDistricts(value.departmentCode).then(setDistricts).catch(() => setDistricts([]));
  }, [value.departmentCode]);

  useEffect(() => {
    if (!value.departmentCode || !value.districtCode) {
      setCities([]);
      return;
    }
    fenexCities(value.departmentCode, value.districtCode).then(setCities).catch(() => setCities([]));
  }, [value.departmentCode, value.districtCode]);

  if (error) {
    return (
      <p className="text-xs text-red-600 dark:text-red-400">
        Could not load the geography list: {error}
      </p>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <div>
        <Label>Departamento</Label>
        <Select
          disabled={disabled}
          value={value.departmentCode}
          onChange={(e) => {
            const opt = departments.find((d) => code(d) === e.target.value);
            // Changing the parent invalidates everything below it — leaving a
            // stale district would produce exactly the combination SIFEN rejects.
            onChange({
              departmentCode: e.target.value,
              departmentName: opt ? label(opt) : '',
              districtCode: '',
              districtName: '',
              cityCode: '',
              cityName: '',
            });
          }}
        >
          <option value="">—</option>
          {departments.map((d) => (
            <option key={code(d)} value={code(d)}>{label(d)}</option>
          ))}
        </Select>
      </div>

      <div>
        <Label>Distrito</Label>
        <Select
          disabled={disabled || !value.departmentCode}
          value={value.districtCode}
          onChange={(e) => {
            const opt = districts.find((d) => code(d) === e.target.value);
            onChange({
              ...value,
              districtCode: e.target.value,
              districtName: opt ? label(opt) : '',
              cityCode: '',
              cityName: '',
            });
          }}
        >
          <option value="">{value.departmentCode ? '—' : 'Elija departamento'}</option>
          {districts.map((d) => (
            <option key={code(d)} value={code(d)}>{label(d)}</option>
          ))}
        </Select>
      </div>

      <div>
        <Label>Ciudad</Label>
        <Select
          disabled={disabled || !value.districtCode}
          value={value.cityCode}
          onChange={(e) => {
            const opt = cities.find((c) => code(c) === e.target.value);
            onChange({ ...value, cityCode: e.target.value, cityName: opt ? label(opt) : '' });
          }}
        >
          <option value="">{value.districtCode ? '—' : 'Elija distrito'}</option>
          {cities.map((c) => (
            <option key={code(c)} value={code(c)}>{label(c)}</option>
          ))}
        </Select>
      </div>
    </div>
  );
}
