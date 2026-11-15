using UnrealBuildTool;

public class OperationZeroTarget : TargetRules
{
	public OperationZeroTarget(TargetInfo Target) : base(Target)
	{
		Type = TargetType.Game;
		DefaultBuildSettings = BuildSettingsVersion.Latest;
		IncludeOrderVersion = EngineIncludeOrderVersion.Latest;
		ExtraModuleNames.Add("OperationZero");
	}
}
