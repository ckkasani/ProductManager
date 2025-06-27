 (function(window, document) {
  const Genie = {
    init: function(config) {
      if (!config || !config.clientId) {
        console.error("Genie Loader: clientId is required.");
        return;
      }

      const iframeId = "genie-chat-iframe";
      const buttonId = "genie-chat-button";

      // Check if already loaded
      if (document.getElementById(iframeId)) {
        console.warn("Genie Loader: Genie already initialized.");
        return;
      }

      const baseUrl = "https://genie.mytechgenie.ai";
      const params = new URLSearchParams({
        clientId: config.clientId,
        themeColor: config.themeColor || "#0052CC",
      });
      const iframeUrl = `${baseUrl}/?${params.toString()}`;

      const iframe = document.createElement("iframe");
      iframe.id = iframeId;
      iframe.src = iframeUrl;
      iframe.style.position = "fixed";
      iframe.style.bottom = "80px";
      iframe.style.right = "20px";
      iframe.style.width = "400px";
      iframe.style.height = "600px";
      iframe.style.border = "none";
      iframe.style.boxShadow = "0 4px 12px rgba(0,0,0,0.3)";
      iframe.style.borderRadius = "10px";
      iframe.style.display = "none";
      iframe.style.zIndex = "999999";

      document.body.appendChild(iframe);

      const button = document.createElement("button");
      button.id = buttonId;
      button.innerText = "💬 Chat with Genie";
      button.style.position = "fixed";
      button.style.bottom = "20px";
      button.style.right = "20px";
      button.style.backgroundColor = config.themeColor || "#0052CC";
      button.style.color = "#fff";
      button.style.border = "none";
      button.style.borderRadius = "30px";
      button.style.padding = "12px 20px";
      button.style.cursor = "pointer";
      button.style.fontSize = "16px";
      button.style.boxShadow = "0 2px 6px rgba(0,0,0,0.2)";
      button.style.zIndex = "999999";

      document.body.appendChild(button);

      button.addEventListener("click", function() {
        const isVisible = iframe.style.display === "block";
        iframe.style.display = isVisible ? "none" : "block";
      });

      window.addEventListener("message", function(event) {
        if (event.origin !== baseUrl) return;

        console.log("Genie Loader received message:", event.data);

        if (event.data === "closeChat") {
          iframe.style.display = "none";
        }
      });
    }
  };

  window.Genie = Genie;
})(window, document);
