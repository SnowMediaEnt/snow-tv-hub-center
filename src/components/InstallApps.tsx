
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Download, Package, ArrowLeft } from 'lucide-react';

interface InstallAppsProps {
  onBack: () => void;
}

const InstallApps = ({ onBack }: InstallAppsProps) => {
  const mainApps = [
    {
      name: "Dreamstreams",
      description: "Premium streaming service",
      size: "45.2 MB",
      category: "Main",
      iconUrl: "/icons/dreamstreams.png",
      isInstalled: true
    },
    {
      name: "VibezTV",
      description: "Live TV streaming",
      size: "38.6 MB", 
      category: "Main",
      iconUrl: "/icons/vibeztv.png",
      isInstalled: false
    },
    {
      name: "Plex",
      description: "Media streaming platform",
      size: "52.3 MB",
      category: "Main",
      iconUrl: "/icons/plex.png",
      isInstalled: true
    },
    {
      name: "Cinema HD",
      description: "Premium streaming application",
      size: "25.6 MB",
      category: "Main",
      iconUrl: "/icons/cinemahd.png",
      isInstalled: false
    },
    {
      name: "IPVanish",
      description: "VPN security & privacy",
      size: "18.9 MB",
      category: "Main",
      iconUrl: "/icons/ipvanish.png",
      isInstalled: true
    }
  ];

  const otherApps = [
    {
      name: "Stremio", 
      description: "Media center for video content",
      size: "89.2 MB",
      category: "Media",
      iconUrl: "/icons/stremio.png",
      isInstalled: false
    },
    {
      name: "Kodi",
      description: "Open source media center", 
      size: "75.4 MB",
      category: "Media",
      iconUrl: "/icons/kodi.png",
      isInstalled: false
    },
    {
      name: "Tivimate",
      description: "IPTV player application",
      size: "12.8 MB",
      category: "IPTV",
      iconUrl: "/icons/tivimate.png",
      isInstalled: false
    }
  ];

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center mb-8">
          <Button 
            onClick={onBack}
            variant="outline" 
            size="lg"
            className="mr-6 bg-blue-600 border-blue-500 text-white hover:bg-blue-700"
          >
            <ArrowLeft className="w-5 h-5 mr-2" />
            Back to Home
          </Button>
          <div>
            <h1 className="text-4xl font-bold text-white mb-2">Main Apps</h1>
            <p className="text-xl text-blue-200">Your premium streaming applications</p>
          </div>
        </div>

        {/* Main Apps Row */}
        <div className="mb-12">
          <h2 className="text-2xl font-bold text-white mb-6">Featured Apps</h2>
          <div className="flex gap-6 justify-center">
            {mainApps.map((app, index) => (
              <Card key={index} className="bg-gradient-to-br from-blue-600 to-blue-800 border-blue-500 p-6 hover:scale-105 transition-all duration-300 w-80">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center">
                    <div className="bg-white p-3 rounded-lg mr-4">
                      <img src={app.iconUrl} alt={app.name} className="w-8 h-8" onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                        (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
                      }} />
                      <Package className="w-8 h-8 text-blue-600 hidden" />
                    </div>
                    <div>
                      <h3 className="text-2xl font-bold text-white">{app.name}</h3>
                      <p className="text-blue-200">{app.category}</p>
                    </div>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-sm ${app.isInstalled ? 'bg-green-600 text-white' : 'bg-yellow-600 text-white'}`}>
                    {app.isInstalled ? 'Installed' : app.size}
                  </span>
                </div>
                
                <p className="text-blue-100 mb-6">{app.description}</p>
                
                <Button className={`w-full text-lg py-3 ${app.isInstalled ? 'bg-green-600 hover:bg-green-700' : 'bg-blue-600 hover:bg-blue-700'} text-white`}>
                  <Download className="w-5 h-5 mr-2" />
                  {app.isInstalled ? 'Launch App' : 'Install APK'}
                </Button>
              </Card>
            ))}
          </div>
        </div>

        {/* Other Apps Section */}
        <div>
          <h2 className="text-2xl font-bold text-white mb-6">Additional Apps</h2>
          <div className="grid grid-cols-2 gap-6">
            {otherApps.map((app, index) => (
              <Card key={index} className="bg-gradient-to-br from-slate-800 to-slate-900 border-slate-700 p-6 hover:scale-105 transition-all duration-300 opacity-75">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center">
                    <div className="bg-slate-600 p-3 rounded-lg mr-4">
                      <img src={app.iconUrl} alt={app.name} className="w-8 h-8 opacity-50" onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                        (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
                      }} />
                      <Package className="w-8 h-8 text-slate-400 hidden" />
                    </div>
                    <div>
                      <h3 className="text-2xl font-bold text-slate-300">{app.name}</h3>
                      <p className="text-slate-400">{app.category}</p>
                    </div>
                  </div>
                  <span className="bg-slate-600 text-slate-300 px-3 py-1 rounded-full text-sm">
                    {app.size}
                  </span>
                </div>
                
                <p className="text-slate-400 mb-6">{app.description}</p>
                
                <Button className="w-full bg-slate-600 hover:bg-slate-700 text-slate-300 text-lg py-3">
                  <Download className="w-5 h-5 mr-2" />
                  Install APK
                </Button>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default InstallApps;
