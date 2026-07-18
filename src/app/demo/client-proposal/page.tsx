import demo from "../../../../public/demos/client-proposal/demo.json";
import { DemoPlayer, type DemoDefinition } from "@/features/demo/demo-player";

export default function ClientProposalDemoPage() {
  return <DemoPlayer demo={demo as DemoDefinition}/>;
}
