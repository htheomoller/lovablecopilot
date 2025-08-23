import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

const Index = () => {
  return (
    <div className="min-h-screen bg-gradient-hero">
      <div className="container mx-auto px-4">
        {/* Header */}
        <header className="py-8">
          <nav className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-gradient-primary rounded-lg flex items-center justify-center">
                <span className="text-primary-foreground font-bold text-sm">CP</span>
              </div>
              <span className="text-xl font-semibold text-foreground">CoPilot</span>
            </div>
            <Button variant="outline" size="sm">
              Get Started
            </Button>
          </nav>
        </header>

        {/* Hero Section */}
        <main className="py-20 text-center">
          <div className="max-w-4xl mx-auto">
            <h1 className="text-5xl md:text-6xl font-bold text-foreground mb-6 leading-tight">
              Your AI{" "}
              <span className="bg-gradient-primary bg-clip-text text-transparent">
                CoPilot
              </span>{" "}
              Awaits
            </h1>
            <p className="text-xl text-muted-foreground mb-12 max-w-2xl mx-auto leading-relaxed">
              Navigate your goals with intelligent assistance. Built for those who demand excellence in their digital journey.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-20">
              <Button 
                size="lg" 
                className="bg-gradient-primary hover:shadow-elegant transform hover:scale-105 transition-all duration-300"
              >
                Start Your Journey
              </Button>
              <Button variant="outline" size="lg" className="group">
                Learn More
                <span className="ml-2 transform group-hover:translate-x-1 transition-transform duration-200">→</span>
              </Button>
            </div>

            {/* Feature Cards */}
            <div className="grid md:grid-cols-3 gap-6 mt-16">
              <Card className="p-6 border-0 bg-card/50 backdrop-blur-sm shadow-elegant hover:shadow-xl transition-all duration-300 hover:transform hover:scale-105">
                <div className="w-12 h-12 bg-gradient-primary rounded-lg mb-4 flex items-center justify-center mx-auto">
                  <span className="text-primary-foreground font-bold">AI</span>
                </div>
                <h3 className="text-lg font-semibold mb-2 text-card-foreground">Intelligent</h3>
                <p className="text-muted-foreground text-sm">
                  Advanced AI capabilities designed to understand and assist with your unique needs.
                </p>
              </Card>

              <Card className="p-6 border-0 bg-card/50 backdrop-blur-sm shadow-elegant hover:shadow-xl transition-all duration-300 hover:transform hover:scale-105">
                <div className="w-12 h-12 bg-gradient-primary rounded-lg mb-4 flex items-center justify-center mx-auto">
                  <span className="text-primary-foreground font-bold">⚡</span>
                </div>
                <h3 className="text-lg font-semibold mb-2 text-card-foreground">Fast</h3>
                <p className="text-muted-foreground text-sm">
                  Lightning-fast responses and seamless performance that keeps up with your pace.
                </p>
              </Card>

              <Card className="p-6 border-0 bg-card/50 backdrop-blur-sm shadow-elegant hover:shadow-xl transition-all duration-300 hover:transform hover:scale-105">
                <div className="w-12 h-12 bg-gradient-primary rounded-lg mb-4 flex items-center justify-center mx-auto">
                  <span className="text-primary-foreground font-bold">🎯</span>
                </div>
                <h3 className="text-lg font-semibold mb-2 text-card-foreground">Precise</h3>
                <p className="text-muted-foreground text-sm">
                  Accurate and focused assistance that delivers exactly what you need, when you need it.
                </p>
              </Card>
            </div>
          </div>
        </main>

        {/* Footer */}
        <footer className="py-8 border-t border-border/10">
          <div className="flex flex-col md:flex-row justify-between items-center">
            <div className="flex items-center space-x-2 mb-4 md:mb-0">
              <div className="w-6 h-6 bg-gradient-primary rounded-md flex items-center justify-center">
                <span className="text-primary-foreground font-bold text-xs">CP</span>
              </div>
              <span className="text-sm text-muted-foreground">CoPilot</span>
            </div>
            <p className="text-sm text-muted-foreground">
              Ready to navigate your future.
            </p>
          </div>
        </footer>
      </div>
    </div>
  );
};

export default Index;