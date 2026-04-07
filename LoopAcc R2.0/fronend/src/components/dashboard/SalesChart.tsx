import { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCompany } from '@/contexts/CompanyContext';

const SalesChart = () => {
  const { selectedCompany } = useCompany();
  const [chartData, setChartData] = useState<any[]>([]);
  const [period, setPeriod] = useState('daily');

  useEffect(() => {
    if (selectedCompany) {
      fetchSalesData();
    }
  }, [selectedCompany, period]);

  const fetchSalesData = async () => {
    try {
      const params = new URLSearchParams({
        companyId: selectedCompany?.id || '',
      });
      const resp = await fetch(`http://localhost:5000/api/vouchers?${params}`);
      if (!resp.ok) throw new Error('Failed to fetch sales data');
      
      const json = await resp.json();
      const vouchers = json?.data || [];

      const groupedData: any = {};
      
      vouchers.forEach((voucher: any) => {
        let dateKey: string;
        const voucherDate = new Date(voucher.voucher_date);
        
        if (period === 'daily') {
          dateKey = voucherDate.toISOString().split('T')[0];
        } else if (period === 'monthly') {
          dateKey = `${voucherDate.getFullYear()}-${(voucherDate.getMonth() + 1).toString().padStart(2, '0')}`;
        } else {
          dateKey = voucherDate.getFullYear().toString();
        }

        if (!groupedData[dateKey]) {
          groupedData[dateKey] = { 
            period: dateKey, 
            sales: 0, 
            purchase: 0 
          };
        }

        if (voucher.voucher_type === 'sales') {
          groupedData[dateKey].sales += voucher.net_amount || 0;
        } else if (voucher.voucher_type === 'purchase') {
          groupedData[dateKey].purchase += voucher.net_amount || 0;
        }
      });

      const formattedData = Object.values(groupedData)
        .sort((a: any, b: any) => a.period.localeCompare(b.period))
        .slice(-30); // Show last 30 periods

      setChartData(formattedData);
    } catch (error) {
      console.error('Error fetching sales data:', error);
    }
  };

  return (
    <Card className="col-span-2">
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle>Sales & Purchase Analysis</CardTitle>
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="daily">Daily</SelectItem>
              <SelectItem value="monthly">Monthly</SelectItem>
              <SelectItem value="yearly">Yearly</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis 
              dataKey="period" 
              tick={{ fontSize: 12 }}
              angle={period === 'daily' ? -45 : 0}
              textAnchor={period === 'daily' ? 'end' : 'middle'}
            />
            <YAxis tick={{ fontSize: 12 }} />
            <Tooltip 
              formatter={(value: number) => [`₹${value.toLocaleString()}`, '']}
              labelFormatter={(label) => `Period: ${label}`}
            />
            <Legend />
            <Bar dataKey="sales" name="Sales" fill="#16a34a" />
            <Bar dataKey="purchase" name="Purchase" fill="#dc2626" />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
};

export default SalesChart;