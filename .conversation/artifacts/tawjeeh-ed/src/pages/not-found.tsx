import { Card, CardContent } from '@/components/ui/card';
import { AlertCircle } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-[#f7fcfe]">
      <Card className="w-full max-w-md mx-4 border-[#b3e5fc]">
        <CardContent className="pt-6">
          <div className="flex mb-4 gap-2">
            <AlertCircle className="h-8 w-8 text-[#2e8b7b]" />
            <h1 className="text-2xl font-bold text-[#004b75]">
              404 Page Not Found
            </h1>
          </div>

          <p className="mt-4 text-sm text-[#64748b]">
            Did you forget to add the page to the router?
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
