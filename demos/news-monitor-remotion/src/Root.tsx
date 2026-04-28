import { Composition } from "remotion";
import { NewsMonitorDemo } from "./NewsMonitorDemo";

export const RemotionRoot = () => {
  return (
    <Composition
      id="NewsMonitorDemo"
      component={NewsMonitorDemo}
      durationInFrames={1800}
      fps={30}
      width={1920}
      height={1080}
    />
  );
};
