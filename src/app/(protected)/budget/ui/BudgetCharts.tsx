

"use client";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend, PieChart, Pie, BarChart, Bar } from "recharts";

export default function BudgetCharts({
  trend12,
  categories,
  merchants,
  month,
}: {
  trend12: { month: string; income: number; expense: number; net: number }[];
  categories: { name: string; total: number }[];
  merchants: { name: string; total: number }[];
  month: string;
}) {
  const catData = (categories || []).map((c) => ({ name: c.name, value: Number(c.total || 0) }));
  const merData = (merchants || []).map((m) => ({ name: m.name, total: Number(m.total || 0) }));

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div className="rounded-2xl border p-4">
        <div className="mb-2 font-medium">12 Ay Trend</div>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={trend12}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="income" />
              <Line type="monotone" dataKey="expense" />
              <Line type="monotone" dataKey="net" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-2xl border p-4">
        <div className="mb-2 font-medium">Kategori Kırılımı (Gider)</div>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie dataKey="value" data={catData} outerRadius={100} label />
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-2xl border p-4 lg:col-span-2">
        <div className="mb-2 font-medium">En Çok Harcama Yapılan Merchant’lar</div>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={merData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="total" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}