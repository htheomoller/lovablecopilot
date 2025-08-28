import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import { AppLayout } from '@/components/AppLayout';
import { toast } from '@/hooks/use-toast';
import { 
  User, 
  Bell, 
  Shield, 
  Database,
  GitBranch,
  Trash2,
  AlertTriangle,
  Save,
  RefreshCw
} from 'lucide-react';

const Settings = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [settings, setSettings] = useState({
    emailNotifications: true,
    auditNotifications: true,
    weeklyReports: false,
    autoAudit: false,
    auditFrequency: 'weekly',
    retentionDays: 30
  });

  const [userProfile, setUserProfile] = useState({
    displayName: '',
    bio: '',
  });

  const handleSaveSettings = async () => {
    setLoading(true);
    try {
      // Simulate saving settings
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      toast({
        title: "Settings Saved",
        description: "Your preferences have been updated successfully.",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to save settings. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleClearAuditHistory = async () => {
    if (!confirm('Are you sure you want to clear all audit history? This action cannot be undone.')) {
      return;
    }

    setLoading(true);
    try {
      // Simulate clearing audit history
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      toast({
        title: "Audit History Cleared",
        description: "All audit records have been permanently deleted.",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to clear audit history. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <AppLayout>
      <div className="p-6 max-w-4xl mx-auto bg-page-background min-h-screen">
        <div className="space-y-6">
          {/* Profile Settings */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                Profile Settings
              </CardTitle>
              <CardDescription>
                Update your profile information and preferences
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email Address</Label>
                <Input
                  id="email"
                  type="email"
                  value={user?.email || ''}
                  disabled
                  className="bg-muted"
                />
                <p className="text-xs text-muted-foreground">
                  Email address cannot be changed
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="displayName">Display Name</Label>
                <Input
                  id="displayName"
                  placeholder="Enter your display name"
                  value={userProfile.displayName}
                  onChange={(e) => setUserProfile(prev => ({ ...prev, displayName: e.target.value }))}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="bio">Bio</Label>
                <Textarea
                  id="bio"
                  placeholder="Tell us about yourself"
                  value={userProfile.bio}
                  onChange={(e) => setUserProfile(prev => ({ ...prev, bio: e.target.value }))}
                  rows={3}
                />
              </div>
            </CardContent>
          </Card>

          {/* Notification Settings */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="h-5 w-5" />
                Notifications
              </CardTitle>
              <CardDescription>
                Configure how you receive updates and alerts
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Email Notifications</Label>
                  <p className="text-sm text-muted-foreground">
                    Receive email updates about your account
                  </p>
                </div>
                <Switch
                  checked={settings.emailNotifications}
                  onCheckedChange={(checked) => 
                    setSettings(prev => ({ ...prev, emailNotifications: checked }))}
                />
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Audit Notifications</Label>
                  <p className="text-sm text-muted-foreground">
                    Get notified when audits complete
                  </p>
                </div>
                <Switch
                  checked={settings.auditNotifications}
                  onCheckedChange={(checked) => 
                    setSettings(prev => ({ ...prev, auditNotifications: checked }))}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Weekly Reports</Label>
                  <p className="text-sm text-muted-foreground">
                    Receive weekly audit summaries
                  </p>
                </div>
                <Switch
                  checked={settings.weeklyReports}
                  onCheckedChange={(checked) => 
                    setSettings(prev => ({ ...prev, weeklyReports: checked }))}
                />
              </div>
            </CardContent>
          </Card>

          {/* Audit Settings */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Audit Configuration
              </CardTitle>
              <CardDescription>
                Configure automated auditing and retention policies
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Automatic Auditing</Label>
                  <p className="text-sm text-muted-foreground">
                    Automatically run audits on connected repositories
                  </p>
                </div>
                <Switch
                  checked={settings.autoAudit}
                  onCheckedChange={(checked) => 
                    setSettings(prev => ({ ...prev, autoAudit: checked }))}
                />
              </div>

              {settings.autoAudit && (
                <div className="space-y-2">
                  <Label htmlFor="frequency">Audit Frequency</Label>
                  <select
                    id="frequency"
                    value={settings.auditFrequency}
                    onChange={(e) => setSettings(prev => ({ ...prev, auditFrequency: e.target.value }))}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                  </select>
                </div>
              )}

              <Separator />

              <div className="space-y-2">
                <Label htmlFor="retention">Data Retention (days)</Label>
                <Input
                  id="retention"
                  type="number"
                  min="1"
                  max="365"
                  value={settings.retentionDays}
                  onChange={(e) => setSettings(prev => ({ ...prev, retentionDays: parseInt(e.target.value) || 30 }))}
                />
                <p className="text-xs text-muted-foreground">
                  How long to keep audit results (1-365 days)
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Data Management */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-5 w-5" />
                Data Management
              </CardTitle>
              <CardDescription>
                Manage your stored data and clear old records
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div className="space-y-1">
                  <h4 className="font-medium">Clear Audit History</h4>
                  <p className="text-sm text-muted-foreground">
                    Permanently delete all audit records
                  </p>
                </div>
                <Button
                  variant="destructive"
                  onClick={handleClearAuditHistory}
                  disabled={loading}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Clear History
                </Button>
              </div>

              <div className="p-4 border rounded-lg bg-yellow-50 dark:bg-yellow-900/20">
                <div className="flex items-start space-x-3">
                  <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-400 mt-0.5" />
                  <div className="space-y-1">
                    <h4 className="font-medium text-yellow-800 dark:text-yellow-200">
                      Data Retention Policy
                    </h4>
                    <p className="text-sm text-yellow-700 dark:text-yellow-300">
                      Audit data older than your retention period will be automatically deleted.
                      Consider downloading important reports before they expire.
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Save Button */}
          <div className="flex justify-end">
            <Button onClick={handleSaveSettings} disabled={loading}>
              {loading ? (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Save Settings
            </Button>
          </div>
        </div>
      </div>
    </AppLayout>
  );
};

export default Settings;